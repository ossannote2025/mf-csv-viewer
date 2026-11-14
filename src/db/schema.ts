import Dexie, { type EntityTable } from 'dexie';
import type { DismissedCandidate, ExclusionRule, ImportRecord, Transaction } from '../lib/types';

export interface MetaEntry {
  key: 'lastImportAt' | 'lastBackupAt';
  value: number;
}

export class MfDatabase extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  rules!: EntityTable<ExclusionRule, 'id'>;
  imports!: EntityTable<ImportRecord, 'seq'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  /** 「二重ではない」とした二重計上の候補（version 2 で追加） */
  dismissed!: EntityTable<DismissedCandidate, 'key'>;

  constructor(name = 'mf-csv-viewer') {
    super(name);
    // スキーマを変更するときは version(2) 以降を追加し、.upgrade() で既存データを変換すること。
    // version(1) の定義は削除・変更しない（既存ユーザーのデータを壊さないため）。
    this.version(1).stores({
      transactions: 'id, ym, date',
      rules: 'id, order',
      imports: '++seq, importedAt',
      meta: 'key',
    });
    // version 2：二重計上の候補の「二重ではない」の記録を追加（既存のテーブルはそのまま）
    this.version(2).stores({
      dismissed: 'key',
    });
  }
}

export const db = new MfDatabase();
