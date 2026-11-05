import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { deleteAllData, deleteMonth, loadAll, saveImported } from './repo';
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
