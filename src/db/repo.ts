import type { DismissedCandidate, ExclusionRule, ImportRecord, Transaction } from '../lib/types';
import { ensureBuiltinRules, repairRules } from '../lib/rules';
import { repairTransactions, type BackupData } from '../lib/backup';
import Dexie from 'dexie';
import { db, type MetaEntry } from './schema';

export interface LoadedData {
  transactions: Transaction[];
  rules: ExclusionRule[];
  meta: Partial<Record<MetaEntry['key'], number>>;
  imports: ImportRecord[];
  dismissed: DismissedCandidate[];
}

export async function loadAll(): Promise<LoadedData> {
  const [storedTransactions, storedRules, metaRows, imports, dismissed] = await Promise.all([
    db.transactions.toArray(),
    db.rules.toArray(),
    db.meta.toArray(),
    db.imports.orderBy('importedAt').toArray(),
    db.dismissed.toArray(),
  ]);
  const withBuiltin = ensureBuiltinRules(storedRules);
  if (withBuiltin.length !== storedRules.length) await db.rules.bulkPut(withBuiltin);
  // 形の崩れた明細・条件の壊れたルールが保存されていても起動できるようにする（明細は形を整え、ルールは OFF にして残す）
  const { transactions } = repairTransactions(storedTransactions);
  const rules = repairRules(withBuiltin);
  const meta: LoadedData['meta'] = {};
  for (const m of metaRows) meta[m.key] = m.value;
  return { transactions, rules, meta, imports, dismissed };
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

/**
 * 取り込んだ明細をまとめて保存する。
 * Safari の IndexedDB はトランザクションの確定ごとの負担が大きいため、ファイルごとではなく
 * まとめて（chunkSize 件ずつ）保存する。
 */
export async function saveImportBatch(
  transactions: Transaction[],
  records: ImportRecord[],
  onProgress?: (done: number, total: number) => void,
  chunkSize = 5000,
): Promise<void> {
  for (let i = 0; i < transactions.length; i += chunkSize) {
    await db.transactions.bulkPut(transactions.slice(i, i + chunkSize));
    onProgress?.(Math.min(i + chunkSize, transactions.length), transactions.length);
  }
  if (records.length === 0) return;
  await db.transaction('rw', db.imports, db.meta, async () => {
    await db.imports.bulkAdd(records.map(({ seq: _seq, ...r }) => (void _seq, r)));
    await db.meta.put({ key: 'lastImportAt', value: Math.max(...records.map((r) => r.importedAt)) });
  });
}

export async function deleteMonth(ym: string): Promise<number> {
  return db.transactions.where('ym').equals(ym).delete();
}

/** ID を指定して明細を削除する（「CSV にない明細」の整理） */
export async function deleteTransactions(ids: string[]): Promise<void> {
  await db.transactions.bulkDelete(ids);
}

export async function saveRule(rule: ExclusionRule): Promise<void> {
  await db.rules.put(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id);
}

/** 複数のルールをまとめて保存する（二重計上の候補から作るとき） */
export async function saveRules(rules: ExclusionRule[]): Promise<void> {
  await db.rules.bulkPut(rules);
}

/** 「二重ではない」の記録を追加する */
export async function addDismissed(items: DismissedCandidate[]): Promise<void> {
  await db.dismissed.bulkPut(items);
}

/** 「二重ではない」の記録を取り消す */
export async function removeDismissed(keys: string[]): Promise<void> {
  await db.dismissed.bulkDelete(keys);
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
  await db.transaction('rw', [db.transactions, db.rules, db.imports, db.meta, db.dismissed], async () => {
    if (mode === 'replace') {
      await Promise.all([db.transactions.clear(), db.rules.clear(), db.imports.clear(), db.dismissed.clear()]);
    }
    await db.transactions.bulkPut(data.transactions);
    await db.rules.bulkPut(data.rules);
    if (data.dismissed.length) await db.dismissed.bulkPut(data.dismissed);
    // 同じバックアップを何度マージしても、取り込み履歴が増えないようにする（ファイル名と日時が同じものは足さない）
    const key = (r: { fileName: string; importedAt: number }) => `${r.importedAt}|${r.fileName}`;
    const seen = new Set((await db.imports.toArray()).map(key));
    const fresh = data.imports.filter((r) => !seen.has(key(r)) && !!seen.add(key(r)));
    if (fresh.length) await db.imports.bulkAdd(fresh.map((r) => ({ ...r })));
    if (data.meta.lastImportAt) await db.meta.put({ key: 'lastImportAt', value: data.meta.lastImportAt });
    if (data.exportedAt) await db.meta.put({ key: 'lastBackupAt', value: data.exportedAt });
  });
}

/** 全データ削除（明細・ルール・履歴・メタ情報・「二重ではない」の記録） */
export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', [db.transactions, db.rules, db.imports, db.meta, db.dismissed], async () => {
    await Promise.all([db.transactions.clear(), db.rules.clear(), db.imports.clear(), db.meta.clear(), db.dismissed.clear()]);
  });
}

/** 救済用に読み出したデータ。failed は読み出せなかったもの（画面に出す名前） */
export interface RawData extends LoadedData {
  failed: string[];
  /** ID・日付・金額が正しくなく、取り出せなかった明細の件数 */
  dropped: number;
}

/**
 * 起動に失敗したときの救済用：保存されているデータを、集計などを通さずにそのまま読み出す。
 * 読めないテーブルがあっても、読めたものだけを返す（1つの失敗で全部をあきらめない）
 */
export async function loadRaw(): Promise<RawData> {
  const failed: string[] = [];
  const read = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await fn();
    } catch {
      failed.push(label);
      return [];
    }
  };
  const { transactions, dropped } = repairTransactions(await read<unknown>('明細', () => db.transactions.toArray()));
  // 条件の壊れたルールは OFF・条件なしにしておく（そのまま書き出すと、復元のときにバックアップごと弾かれるため）
  const rules = repairRules(ensureBuiltinRules(await read('除外ルール', () => db.rules.toArray())));
  const imports = await read('取り込み履歴', () => db.imports.toArray());
  const dismissed = await read('「二重ではない」の記録', () => db.dismissed.toArray());
  const meta: LoadedData['meta'] = {};
  for (const m of await read('最終取り込み日など', () => db.meta.toArray())) meta[m.key] = m.value;
  return { transactions, rules, imports, dismissed, meta, failed, dropped };
}

/**
 * 起動に失敗したときの救済用：全データを削除する。
 * ふつうの削除ができないとき（データベース自体が開けないなど）は、データベースごと作り直す
 */
export async function resetDatabase(): Promise<void> {
  try {
    await deleteAllData();
  } catch {
    db.close();
    await Dexie.delete(db.name);
    await db.open();
  }
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
