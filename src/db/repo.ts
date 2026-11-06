import type { ExclusionRule, ImportRecord, Transaction } from '../lib/types';
import { ensureBuiltinRules } from '../lib/rules';
import type { BackupData } from '../lib/backup';
import { db, type MetaEntry } from './schema';

export interface LoadedData {
  transactions: Transaction[];
  rules: ExclusionRule[];
  meta: Partial<Record<MetaEntry['key'], number>>;
  imports: ImportRecord[];
}

export async function loadAll(): Promise<LoadedData> {
  const [transactions, storedRules, metaRows, imports] = await Promise.all([
    db.transactions.toArray(),
    db.rules.toArray(),
    db.meta.toArray(),
    db.imports.orderBy('importedAt').toArray(),
  ]);
  const rules = ensureBuiltinRules(storedRules);
  if (rules.length !== storedRules.length) await db.rules.bulkPut(rules);
  const meta: LoadedData['meta'] = {};
  for (const m of metaRows) meta[m.key] = m.value;
  return { transactions, rules, meta, imports };
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

/**
 * バックアップから復元する。
 * - replace: 現在のデータをすべて消してバックアップの内容にする
 * - merge: 現在のデータに追加し、同じIDの明細・ルールはバックアップの内容で上書きする
 */
export async function restoreBackup(data: BackupData, mode: 'replace' | 'merge'): Promise<void> {
  await db.transaction('rw', [db.transactions, db.rules, db.imports, db.meta], async () => {
    if (mode === 'replace') {
      await Promise.all([db.transactions.clear(), db.rules.clear(), db.imports.clear()]);
    }
    await db.transactions.bulkPut(data.transactions);
    await db.rules.bulkPut(data.rules);
    if (data.imports.length) await db.imports.bulkAdd(data.imports.map((r) => ({ ...r })));
    if (data.meta.lastImportAt) await db.meta.put({ key: 'lastImportAt', value: data.meta.lastImportAt });
    if (data.exportedAt) await db.meta.put({ key: 'lastBackupAt', value: data.exportedAt });
  });
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
