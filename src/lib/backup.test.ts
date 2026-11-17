import { describe, expect, it } from 'vitest';
import { backupFileName, backupIsStale, BackupError, createBackup, parseBackup, repairTransaction, repairTransactions } from './backup';
import { BUILTIN_RULES } from './rules';
import type { DismissedCandidate, ExclusionRule, Transaction } from './types';

const tx: Transaction = {
  id: 'A1', date: '2025-08-01', ym: '2025-08', content: '架空スーパー', amount: -1200, institution: '架空カード',
  large: '食費', middle: '食料品', memo: '', isTarget: true, isTransfer: false, sourceFile: 'a.csv', row: 2, importedAt: 1,
};
const dismissed: DismissedCandidate = { key: 'w|架空銀行|カード引き落とし', kind: 'withdrawal', label: '架空カードの引き落とし', dismissedAt: 3 };
const rule: ExclusionRule = {
  id: 'r1', name: 'カード引き落とし', enabled: true, order: 10, cond: { content: { op: 'contains', value: '引き落とし' } },
  createdAt: 1, updatedAt: 2,
};

const choice = { key: '架空モバイル', choice: 'fixed' as const, label: '架空モバイル', decidedAt: 2 };

describe('バックアップ', () => {
  it('書き出したものをそのまま読み込める（往復）', () => {
    const b = createBackup([tx], [...BUILTIN_RULES, rule], [{ seq: 3, fileName: 'a.csv', importedAt: 1, rowCount: 1, added: 1, updated: 0 }], { lastImportAt: 5 }, [dismissed], [choice], 99);
    const restored = parseBackup(JSON.stringify(b));
    expect(restored.transactions).toEqual([tx]);
    expect(restored.rules.find((r) => r.id === 'r1')).toEqual(rule);
    expect(restored.rules.filter((r) => r.builtin).map((r) => r.builtin)).toEqual(['transfer', 'nonTarget']);
    expect(restored.imports[0]).not.toHaveProperty('seq');
    expect(restored.meta.lastImportAt).toBe(5);
    expect(restored.exportedAt).toBe(99);
    expect(restored.dismissed).toEqual([dismissed]);
    expect(restored.recurringChoices).toEqual([choice]);
    expect(restored.format).toBe(3);
  });

  it('形式2（固定費の選択がない）のバックアップも読める。固定費の選択の壊れた項目は読み飛ばす', () => {
    const old = { app: 'mf-csv-viewer', format: 2, exportedAt: 1, transactions: [tx], rules: [rule], imports: [], meta: {}, dismissed: [dismissed] };
    expect(parseBackup(JSON.stringify(old)).recurringChoices).toEqual([]);
    const b = { ...old, format: 3, recurringChoices: [{ key: '' }, 'x', { key: 'a', choice: 'maybe' }, { key: 'b', choice: 'notFixed' }] };
    expect(parseBackup(JSON.stringify(b)).recurringChoices).toEqual([{ key: 'b', choice: 'notFixed', label: '', decidedAt: 0 }]);
  });

  it('形式1（「二重ではない」の記録がない）のバックアップも読める', () => {
    const old = { app: 'mf-csv-viewer', format: 1, exportedAt: 1, transactions: [tx], rules: [rule], imports: [], meta: {} };
    const restored = parseBackup(JSON.stringify(old));
    expect(restored.transactions).toEqual([tx]);
    expect(restored.dismissed).toEqual([]);
  });

  it('「二重ではない」の記録の壊れた項目は読み飛ばす', () => {
    const b = { ...createBackup([tx], [rule], [], {}, [], [], 1), dismissed: [{ key: '' }, 'x', { key: 'd|a|b', kind: 'duplicate' }] };
    expect(parseBackup(JSON.stringify(b)).dismissed).toEqual([{ key: 'd|a|b', kind: 'duplicate', label: '', dismissedAt: 0 }]);
  });

  it('不正なファイルは日本語のエラーにする', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow('このアプリのバックアップファイルではありません');
    expect(() => parseBackup(JSON.stringify({ app: 'mf-csv-viewer', format: 999, transactions: [], rules: [] }))).toThrow('新しいバージョン');
    const broken = JSON.parse(JSON.stringify(createBackup([tx], [], [], {}, [], [])));
    broken.transactions[0].amount = 'abc';
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('1件目の「金額」');
  });

  it('ファイル名に日時が入る', () => {
    expect(backupFileName(new Date(2025, 0, 2, 3, 4))).toBe('mf-csv-viewer-backup-20250102-0304.json');
  });

  it('30日以上バックアップしていなければ促す', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(backupIsStale(undefined, true)).toBe(true);
    expect(backupIsStale(undefined, false)).toBe(false);
    expect(backupIsStale(0 + 1, true, 29 * day)).toBe(false);
    expect(backupIsStale(1, true, 31 * day)).toBe(true);
  });
});

describe('バックアップ：除外ルールの条件の検証', () => {
  const base = { app: 'mf-csv-viewer', format: 2, exportedAt: 1, transactions: [tx] };
  const withCond = (cond: unknown) => JSON.stringify({ ...base, rules: [{ id: 'r', name: '壊れたルール', enabled: true, cond }] });

  it('条件の形が正しくないルールがあれば、復元の前にエラーにする', () => {
    for (const cond of [
      { content: { op: 'equals' } },
      { content: { op: 'regex', value: 'x' } },
      { content: '架空ストア' },
      { large: '食費' },
      { institutions: [1, 2] },
      { amountMin: '100' },
      { amountMax: -1 },
      { flow: 'both' },
      { dateFrom: '2025/10/01' },
    ]) {
      expect(() => parseBackup(withCond(cond)), JSON.stringify(cond)).toThrow(BackupError);
    }
    expect(() => parseBackup(withCond({ content: { op: 'equals' } }))).toThrow('除外ルールの1件目「壊れたルール」の条件が正しくありません。');
  });

  it('正しい条件はそのまま読め、知らない項目は捨てる', () => {
    const cond = { content: { op: 'startsWith', value: '架空' }, large: ['食費'], amountMin: 0, amountMax: 500, flow: 'expense', dateFrom: '2025-10-01', dateTo: '2025-10-31' };
    expect(parseBackup(withCond({ ...cond, unknown: 1 })).rules[0].cond).toEqual(cond);
    expect(parseBackup(withCond({})).rules[0].cond).toEqual({});
  });

  it('組み込みルールは条件を見ない', () => {
    const json = JSON.stringify({ ...base, rules: [{ id: 'builtin-transfer', name: '振替', enabled: false, builtin: 'transfer', cond: { content: 1 } }] });
    expect(parseBackup(json).rules[0]).toMatchObject({ builtin: 'transfer', enabled: false, cond: {} });
  });
});

describe('形の崩れた明細を整える', () => {
  it('正しい形の明細は、同じものをそのまま返す', () => {
    expect(repairTransaction(tx)).toBe(tx);
  });

  it('欠けている項目を既定値で補う', () => {
    const broken = { id: 'B1', date: '2025-08-02', amount: -500, isTransfer: 'yes' };
    expect(repairTransaction(broken)).toEqual({
      id: 'B1', date: '2025-08-02', ym: '2025-08', content: '', amount: -500, institution: '', large: '未分類', middle: '未分類',
      memo: '', isTarget: true, isTransfer: false, sourceFile: '', row: 0, importedAt: 0,
    });
    // 年月がずれていたら日付に合わせる
    expect(repairTransaction({ ...tx, ym: '1999-01' })?.ym).toBe('2025-08');
  });

  it('ID・日付・金額が正しくない明細は直せないので捨て、件数を返す', () => {
    const list = [tx, { ...tx, id: '' }, { ...tx, date: '2025/08/01' }, { ...tx, amount: '100' }, { ...tx, amount: Number.NaN }, null, 'x'];
    const r = repairTransactions(list);
    expect(r.transactions).toEqual([tx]);
    expect(r.dropped).toBe(6);
  });

  it('整えた明細は、バックアップとして書き出して読み戻せる', () => {
    const repaired = repairTransactions([{ id: 'B1', date: '2025-08-02', amount: -500 }]).transactions;
    const json = JSON.stringify(createBackup(repaired, [...BUILTIN_RULES], [], {}, [], [], 1));
    expect(parseBackup(json).transactions).toEqual(repaired);
  });
});

