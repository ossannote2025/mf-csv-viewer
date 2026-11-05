import type { ExclusionRule, ImportRecord, Transaction } from './types';

export const BACKUP_APP = 'mf-csv-viewer';
/** バックアップJSONの形式バージョン。形式を変えたら上げ、古い形式の変換を parseBackup に追加する */
export const BACKUP_FORMAT = 1;

export interface BackupData {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: number;
  transactions: Transaction[];
  rules: ExclusionRule[];
  imports: ImportRecord[];
  meta: { lastImportAt?: number };
}

export function createBackup(
  transactions: Transaction[],
  rules: ExclusionRule[],
  imports: ImportRecord[],
  meta: { lastImportAt?: number },
  now = Date.now(),
): BackupData {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: now,
    transactions,
    rules,
    imports: imports.map(({ seq: _seq, ...rest }) => (void _seq, rest)),
    meta: { lastImportAt: meta.lastImportAt },
  };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `mf-csv-viewer-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

export class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function checkTransaction(t: unknown, i: number): Transaction {
  const bad = (field: string) => new BackupError(`明細の${i + 1}件目の「${field}」が正しくありません。`);
  if (!isObj(t)) throw bad('データ');
  if (!isStr(t.id) || t.id === '') throw bad('ID');
  if (!isStr(t.date) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw bad('日付');
  if (!isNum(t.amount)) throw bad('金額');
  for (const f of ['content', 'institution', 'large', 'middle', 'memo'] as const) if (!isStr(t[f])) throw bad(f);
  if (!isBool(t.isTarget) || !isBool(t.isTransfer)) throw bad('計算対象／振替');
  return {
    id: t.id,
    date: t.date,
    ym: t.date.slice(0, 7),
    content: t.content as string,
    amount: t.amount,
    institution: t.institution as string,
    large: t.large as string,
    middle: t.middle as string,
    memo: t.memo as string,
    isTarget: t.isTarget,
    isTransfer: t.isTransfer,
    sourceFile: isStr(t.sourceFile) ? t.sourceFile : '',
    row: isNum(t.row) ? t.row : 0,
    importedAt: isNum(t.importedAt) ? t.importedAt : 0,
  };
}

function checkRule(r: unknown, i: number): ExclusionRule {
  if (!isObj(r) || !isStr(r.id) || !isStr(r.name) || !isBool(r.enabled) || !isObj(r.cond)) {
    throw new BackupError(`除外ルールの${i + 1}件目が正しくありません。`);
  }
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    builtin: r.builtin === 'transfer' || r.builtin === 'nonTarget' ? r.builtin : undefined,
    order: isNum(r.order) ? r.order : 100 + i,
    cond: r.cond as ExclusionRule['cond'],
    createdAt: isNum(r.createdAt) ? r.createdAt : 0,
    updatedAt: isNum(r.updatedAt) ? r.updatedAt : 0,
  };
}

/** バックアップJSONの文字列を検証して読み込む。問題があれば日本語のメッセージで BackupError を投げる */
export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new BackupError('JSONとして読み込めませんでした。ファイルが壊れていないか確認してください。');
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) {
    throw new BackupError('このアプリのバックアップファイルではありません。');
  }
  if (!isNum(raw.format) || raw.format > BACKUP_FORMAT) {
    throw new BackupError('新しいバージョンのアプリで作られたバックアップです。アプリを最新にしてから読み込んでください。');
  }
  if (!Array.isArray(raw.transactions) || !Array.isArray(raw.rules)) {
    throw new BackupError('バックアップに明細または除外ルールのデータがありません。');
  }
  const meta = isObj(raw.meta) ? raw.meta : {};
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: isNum(raw.exportedAt) ? raw.exportedAt : 0,
    transactions: raw.transactions.map(checkTransaction),
    rules: raw.rules.map(checkRule),
    imports: Array.isArray(raw.imports)
      ? raw.imports.filter(isObj).map((r) => ({
          fileName: isStr(r.fileName) ? r.fileName : '',
          importedAt: isNum(r.importedAt) ? r.importedAt : 0,
          rowCount: isNum(r.rowCount) ? r.rowCount : 0,
          added: isNum(r.added) ? r.added : 0,
          updated: isNum(r.updated) ? r.updated : 0,
        }))
      : [],
    meta: { lastImportAt: isNum(meta.lastImportAt) ? meta.lastImportAt : undefined },
  };
}

/** 最終バックアップから30日以上（または未実施）なら true */
export function backupIsStale(lastBackupAt: number | undefined, hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false;
  if (!lastBackupAt) return true;
  return now - lastBackupAt >= 30 * 24 * 60 * 60 * 1000;
}
