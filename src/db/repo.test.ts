import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { deleteAllData, deleteMonth, loadAll, restoreBackup, saveImportBatch, saveImported } from './repo';
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
  });

  it('置き換え：既存データは消えてバックアップの内容になる', async () => {
    await saveImported([tx('old', '2024-01-01')], { fileName: 'f', importedAt: 1, rowCount: 1, added: 1, updated: 0 });
    await restoreBackup(backup(['a', 'b']), 'replace');
    const d = await loadAll();
    expect(d.transactions.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(d.rules.map((r) => r.id)).toContain('r1');
    expect(d.rules.filter((r) => r.builtin)).toHaveLength(2);
    expect(d.meta.lastBackupAt).toBe(777);
  });

  it('マージ：既存データを残し、同じIDは上書き', async () => {
    await saveImported([tx('old', '2024-01-01'), tx('a', '2024-01-01')], { fileName: 'f', importedAt: 1, rowCount: 2, added: 2, updated: 0 });
    await restoreBackup(backup(['a', 'b']), 'merge');
    const d = await loadAll();
    expect(d.transactions.map((t) => t.id).sort()).toEqual(['a', 'b', 'old']);
    expect(d.transactions.find((t) => t.id === 'a')!.date).toBe('2025-08-01');
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
