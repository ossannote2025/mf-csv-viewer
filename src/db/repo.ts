import type { ExclusionRule, ImportRecord, Transaction } from '../lib/types';
import { ensureBuiltinRules } from '../lib/rules';
import { db, type MetaEntry } from './schema';

export interface LoadedData {
  transactions: Transaction[];
  rules: ExclusionRule[];
  meta: Partial<Record<MetaEntry['key'], number>>;
}

export async function loadAll(): Promise<LoadedData> {
  const [transactions, storedRules, metaRows] = await Promise.all([
    db.transactions.toArray(),
    db.rules.toArray(),
    db.meta.toArray(),
  ]);
  const rules = ensureBuiltinRules(storedRules);
  if (rules.length !== storedRules.length) await db.rules.bulkPut(rules);
  const meta: LoadedData['meta'] = {};
  for (const m of metaRows) meta[m.key] = m.value;
  return { transactions, rules, meta };
}

export async function saveImported(transactions: Transaction[], record: ImportRecord): Promise<void> {
  await db.transaction('rw', db.transactions, db.imports, db.meta, async () => {
    await db.transactions.bulkPut(transactions);
    // add() は渡したオブジェクトに seq を書き込むため、コピーを渡す
    const { seq: _seq, ...rest } = record;
    void _seq;
    await db.imports.add(rest);
    await db.meta.put({ key: 'lastImportAt', value: record.importedAt });
  });
}

export async function deleteMonth(ym: string): Promise<number> {
  return db.transactions.where('ym').equals(ym).delete();
}

export async function saveRule(rule: ExclusionRule): Promise<void> {
  await db.rules.put(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id);
}

export async function setMeta(key: MetaEntry['key'], value: number): Promise<void> {
  await db.meta.put({ key, value });
}

/** 全データ削除（明細・ルール・履歴・メタ情報） */
export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', [db.transactions, db.rules, db.imports, db.meta], async () => {
    await Promise.all([db.transactions.clear(), db.rules.clear(), db.imports.clear(), db.meta.clear()]);
  });
}

/** ブラウザに保存領域の永続化をリクエストする（Safariの自動削除対策） */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

export type { ImportRecord };
