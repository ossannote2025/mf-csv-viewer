import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, MfDatabase } from './schema';
import { addDismissed, deleteAllData, deleteMonth, deleteTransactions, loadAll, loadRaw, resetDatabase, removeDismissed, restoreBackup, saveImportBatch, saveImported, saveRules } from './repo';
import { createBackup, parseBackup } from '../lib/backup';
import { computeExclusions } from '../lib/rules';
import type { Transaction } from '../lib/types';

function tx(id: string, date: string): Transaction {
  return {
    id, date, ym: date.slice(0, 7), content: 'x', amount: -1, institution: 'A', large: 'L', middle: 'M', memo: '',
    isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 1,
  };
}

describe('repo（IndexedDB）', () => {
  beforeEach(async () => {
    await deleteAllData();
  });

  it('初回読み込みで組み込みルールを作成する', async () => {
    const d = await loadAll();
    expect(d.transactions).toEqual([]);
    expect(d.rules.map((r) => r.builtin)).toEqual(['transfer', 'nonTarget']);
    expect(await db.rules.count()).toBe(2);
  });

  it('条件の壊れたルールが保存されていても読み込める（そのルールは OFF にして残す）', async () => {
    await db.rules.put({ id: 'x', name: '壊れたルール', enabled: true, order: 10, cond: { content: { op: 'equals' } }, createdAt: 0, updatedAt: 0 } as never);
    const d = await loadAll();
    expect(d.rules.find((r) => r.id === 'x')).toMatchObject({ enabled: false, cond: {} });
    expect(() => computeExclusions([tx('a', '2025-08-01')], d.rules)).not.toThrow();
  });

  it('ID を指定して明細を削除できる（ない ID は無視する）', async () => {
    await saveImported([tx('a', '2025-08-01'), tx('b', '2025-08-02'), tx('c', '2025-09-01')], { fileName: 'f', importedAt: 1, rowCount: 3, added: 3, updated: 0 });
    await deleteTransactions(['b', 'zzz']);
    expect((await loadAll()).transactions.map((t) => t.id).sort()).toEqual(['a', 'c']);
  });

  it('救済用の読み出し：集計を通さずにそのまま読み、壊れたルールは OFF にする', async () => {
    await saveImported([tx('a', '2025-08-01')], { fileName: 'f', importedAt: 7, rowCount: 1, added: 1, updated: 0 });
    await db.rules.put({ id: 'x', name: '壊れたルール', enabled: true, order: 10, cond: { content: { op: 'equals' } }, createdAt: 0, updatedAt: 0 } as never);
    await addDismissed([{ key: 'd|a|b', kind: 'duplicate', label: 'x', dismissedAt: 1 }]);
    const raw = await loadRaw();
    expect(raw.failed).toEqual([]);
    expect(raw.transactions.map((t) => t.id)).toEqual(['a']);
    expect(raw.rules.find((r) => r.id === 'x')).toMatchObject({ enabled: false, cond: {} });
    expect(raw.rules.filter((r) => r.builtin)).toHaveLength(2);
    expect(raw.imports).toHaveLength(1);
    expect(raw.dismissed).toHaveLength(1);
    expect(raw.meta.lastImportAt).toBe(7);
    // 書き出したバックアップは、そのまま復元できる
    const json = JSON.stringify(createBackup(raw.transactions, raw.rules, raw.imports, raw.meta, raw.dismissed, 9));
    expect(parseBackup(json).transactions).toHaveLength(1);
  });

  it('形の崩れた明細が保存されていても読み込める（直せるものは整え、直せないものは外す）', async () => {
    await db.transactions.bulkPut([tx('a', '2025-08-01'), { id: 'b', date: '2025-08-02', amount: -5 }, { id: 'c', date: 'x', amount: -5 }] as never);
    const d = await loadAll();
    expect(d.transactions.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(d.transactions.find((t) => t.id === 'b')).toMatchObject({ content: '', ym: '2025-08', isTarget: true });
    const content = { id: 'r', name: 'r', enabled: true, order: 10, cond: { content: { op: 'contains' as const, value: 'x' } }, createdAt: 0, updatedAt: 0 };
    expect(() => computeExclusions(d.transactions, [...d.rules, content])).not.toThrow();
    const raw = await loadRaw();
    expect(raw.transactions).toHaveLength(2);
    expect(raw.dropped).toBe(1);
  });

  it('救済用の読み出し：読めないテーブルがあっても、読めたものだけを返す', async () => {
    await saveImported([tx('a', '2025-08-01')], { fileName: 'f', importedAt: 7, rowCount: 1, added: 1, updated: 0 });
    const original = db.rules.toArray.bind(db.rules);
    db.rules.toArray = (() => Promise.reject(new Error('読めない'))) as never;
    try {
      const raw = await loadRaw();
      expect(raw.failed).toEqual(['除外ルール']);
      expect(raw.transactions).toHaveLength(1);
      expect(raw.rules.map((r) => r.builtin)).toEqual(['transfer', 'nonTarget']);
    } finally {
      db.rules.toArray = original;
    }
  });

  it('救済用の全削除：消したあと、最初の状態で読み込める', async () => {
    await saveImported([tx('a', '2025-08-01')], { fileName: 'f', importedAt: 7, rowCount: 1, added: 1, updated: 0 });
    await resetDatabase();
    const d = await loadAll();
    expect(d.transactions).toEqual([]);
    expect(d.rules.map((r) => r.builtin)).toEqual(['transfer', 'nonTarget']);
  });

  it('救済用の全削除：ふつうの削除ができないときは、データベースごと作り直す', async () => {
    await saveImported([tx('a', '2025-08-01')], { fileName: 'f', importedAt: 7, rowCount: 1, added: 1, updated: 0 });
    const original = db.transactions.clear.bind(db.transactions);
    db.transactions.clear = (() => Promise.reject(new Error('消せない'))) as never;
    try {
      await resetDatabase();
    } finally {
      db.transactions.clear = original;
    }
    expect((await loadAll()).transactions).toEqual([]);
  });

  it('同じIDは上書き保存され、月単位で削除できる', async () => {
    const rec = { fileName: 'f', importedAt: 123, rowCount: 2, added: 2, updated: 0 };
    await saveImported([tx('a', '2025-08-01'), tx('b', '2025-09-01')], rec);
    await saveImported([{ ...tx('a', '2025-08-01'), amount: -99 }], rec);
    let d = await loadAll();
    expect(d.transactions).toHaveLength(2);
    expect(d.transactions.find((t) => t.id === 'a')!.amount).toBe(-99);
    expect(d.meta.lastImportAt).toBe(123);
    expect(await deleteMonth('2025-08')).toBe(1);
    d = await loadAll();
    expect(d.transactions.map((t) => t.id)).toEqual(['b']);
  });
});

describe('復元', () => {
  beforeEach(async () => {
    await deleteAllData();
  });

  const backup = (ids: string[]) => ({
    app: 'mf-csv-viewer' as const,
    format: 1,
    exportedAt: 777,
    transactions: ids.map((id) => tx(id, '2025-08-01')),
    rules: [{ id: 'r1', name: 'ルール', enabled: true, order: 10, cond: { large: ['L'] }, createdAt: 0, updatedAt: 0 }],
    imports: [{ fileName: 'f', importedAt: 1, rowCount: 1, added: 1, updated: 0 }],
    meta: { lastImportAt: 5 },
    dismissed: [{ key: 'd|a|b', kind: 'duplicate' as const, label: '組', dismissedAt: 1 }],
  });

  it('置き換え：既存データは消えてバックアップの内容になる', async () => {
    await saveImported([tx('old', '2024-01-01')], { fileName: 'f', importedAt: 1, rowCount: 1, added: 1, updated: 0 });
    await restoreBackup(backup(['a', 'b']), 'replace');
    const d = await loadAll();
    expect(d.transactions.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(d.rules.map((r) => r.id)).toContain('r1');
    expect(d.rules.filter((r) => r.builtin)).toHaveLength(2);
    expect(d.meta.lastBackupAt).toBe(777);
    expect(d.dismissed.map((x) => x.key)).toEqual(['d|a|b']);
  });

  it('置き換え：「二重ではない」の記録もバックアップの内容になる', async () => {
    await addDismissed([{ key: 'w|old|x', kind: 'withdrawal', label: '', dismissedAt: 1 }]);
    await restoreBackup({ ...backup(['a']), dismissed: [] }, 'replace');
    expect((await loadAll()).dismissed).toEqual([]);
  });

  it('マージ：既存データを残し、同じIDは上書き', async () => {
    await saveImported([tx('old', '2024-01-01'), tx('a', '2024-01-01')], { fileName: 'f', importedAt: 1, rowCount: 2, added: 2, updated: 0 });
    await restoreBackup(backup(['a', 'b']), 'merge');
    const d = await loadAll();
    expect(d.transactions.map((t) => t.id).sort()).toEqual(['a', 'b', 'old']);
    expect(d.transactions.find((t) => t.id === 'a')!.date).toBe('2025-08-01');
  });
});

describe('二重計上の候補', () => {
  beforeEach(async () => {
    await deleteAllData();
  });

  it('「二重ではない」の記録を追加・取り消しでき、全データ削除で消える', async () => {
    await addDismissed([
      { key: 'w|銀行|カード', kind: 'withdrawal', label: 'a', dismissedAt: 1 },
      { key: 'd|x|y', kind: 'duplicate', label: 'b', dismissedAt: 2 },
    ]);
    expect((await loadAll()).dismissed.map((d) => d.key).sort()).toEqual(['d|x|y', 'w|銀行|カード']);
    await removeDismissed(['d|x|y']);
    expect((await loadAll()).dismissed.map((d) => d.key)).toEqual(['w|銀行|カード']);
    await deleteAllData();
    expect((await loadAll()).dismissed).toEqual([]);
  });

  it('複数のルールをまとめて保存できる', async () => {
    const r = (id: string) => ({ id, name: id, enabled: true, order: 10, cond: { large: ['L'] }, createdAt: 0, updatedAt: 0 });
    await saveRules([r('x'), r('y')]);
    expect((await loadAll()).rules.map((x) => x.id)).toEqual(expect.arrayContaining(['x', 'y']));
  });
});

describe('saveImportBatch', () => {
  beforeEach(async () => {
    await deleteAllData();
  });

  it('分割して保存し、進捗を通知し、取り込み履歴と最終取り込み日を記録する', async () => {
    const ts = Array.from({ length: 12 }, (_, i) => tx(`id${i}`, '2025-08-01'));
    const progress: number[] = [];
    await saveImportBatch(
      ts,
      [
        { fileName: 'a', importedAt: 10, rowCount: 6, added: 6, updated: 0 },
        { fileName: 'b', importedAt: 20, rowCount: 6, added: 6, updated: 0 },
      ],
      (done) => progress.push(done),
      5,
    );
    const d = await loadAll();
    expect(d.transactions).toHaveLength(12);
    expect(progress).toEqual([5, 10, 12]);
    expect(d.imports.map((r) => r.fileName)).toEqual(['a', 'b']);
    expect(d.meta.lastImportAt).toBe(20);
  });
});

describe('スキーマの更新（version 1 → 2）', () => {
  it('version 1 のデータを残したまま、「二重ではない」の記録を保存できるようになる', async () => {
    const name = 'mf-csv-viewer-migration-test';
    const old = new Dexie(name);
    old.version(1).stores({ transactions: 'id, ym, date', rules: 'id, order', imports: '++seq, importedAt', meta: 'key' });
    await old.table('transactions').put(tx('keep', '2025-08-01'));
    old.close();

    const next = new MfDatabase(name);
    await next.open();
    expect(next.verno).toBe(2);
    expect((await next.transactions.toArray()).map((t) => t.id)).toEqual(['keep']);
    await next.dismissed.put({ key: 'd|a|b', kind: 'duplicate', label: '', dismissedAt: 1 });
    expect(await next.dismissed.count()).toBe(1);
    next.close();
    await Dexie.delete(name);
  });
});
