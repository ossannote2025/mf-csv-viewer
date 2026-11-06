import { describe, expect, it } from 'vitest';
import { backupFileName, backupIsStale, BackupError, createBackup, parseBackup } from './backup';
import { BUILTIN_RULES } from './rules';
import type { ExclusionRule, Transaction } from './types';

const tx: Transaction = {
  id: 'A1', date: '2025-08-01', ym: '2025-08', content: '架空スーパー', amount: -1200, institution: '架空カード',
  large: '食費', middle: '食料品', memo: '', isTarget: true, isTransfer: false, sourceFile: 'a.csv', row: 2, importedAt: 1,
};
const rule: ExclusionRule = {
  id: 'r1', name: 'カード引き落とし', enabled: true, order: 10, cond: { content: { op: 'contains', value: '引き落とし' } },
  createdAt: 1, updatedAt: 2,
};

describe('バックアップ', () => {
  it('書き出したものをそのまま読み込める（往復）', () => {
    const b = createBackup([tx], [...BUILTIN_RULES, rule], [{ seq: 3, fileName: 'a.csv', importedAt: 1, rowCount: 1, added: 1, updated: 0 }], { lastImportAt: 5 }, 99);
    const restored = parseBackup(JSON.stringify(b));
    expect(restored.transactions).toEqual([tx]);
    expect(restored.rules.find((r) => r.id === 'r1')).toEqual(rule);
    expect(restored.rules.filter((r) => r.builtin).map((r) => r.builtin)).toEqual(['transfer', 'nonTarget']);
    expect(restored.imports[0]).not.toHaveProperty('seq');
    expect(restored.meta.lastImportAt).toBe(5);
    expect(restored.exportedAt).toBe(99);
  });

  it('不正なファイルは日本語のエラーにする', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow('このアプリのバックアップファイルではありません');
    expect(() => parseBackup(JSON.stringify({ app: 'mf-csv-viewer', format: 999, transactions: [], rules: [] }))).toThrow('新しいバージョン');
    const broken = JSON.parse(JSON.stringify(createBackup([tx], [], [], {})));
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
