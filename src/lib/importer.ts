import { decodeCsvBytes, type DetectedEncoding } from './encoding';
import { parseMfCsv, type RowError } from './csvParser';
import type { Transaction } from './types';

export interface FileImportResult {
  fileName: string;
  ok: boolean;
  error?: string;
  encoding?: DetectedEncoding;
  rowCount: number;
  added: number;
  updated: number;
  rowErrors: RowError[];
  months: string[];
}

export interface ImportSummary {
  files: FileImportResult[];
  added: number;
  updated: number;
  failed: FileImportResult[];
}

/**
 * 既存の明細（Map）に取り込み分をIDで上書きマージする。
 * 同じIDは後から来たもので上書きし、二重計上しない。
 */
export function mergeById(existing: Map<string, Transaction>, incoming: Transaction[]): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  for (const t of incoming) {
    if (existing.has(t.id)) updated++;
    else added++;
    existing.set(t.id, t);
  }
  return { added, updated };
}

/** バイト列 → 解析 → マージまでを1ファイル分行う（DB保存は呼び出し側） */
export function importCsvBytes(
  bytes: ArrayBuffer | Uint8Array,
  fileName: string,
  existing: Map<string, Transaction>,
  importedAt = Date.now(),
): { result: FileImportResult; transactions: Transaction[] } {
  let decoded;
  try {
    decoded = decodeCsvBytes(bytes);
  } catch {
    return {
      result: { fileName, ok: false, error: '文字コードを判別できませんでした。', rowCount: 0, added: 0, updated: 0, rowErrors: [], months: [] },
      transactions: [],
    };
  }
  const parsed = parseMfCsv(decoded.text, fileName, importedAt);
  if (parsed.fileError) {
    return {
      result: {
        fileName,
        ok: false,
        error: parsed.fileError,
        encoding: decoded.encoding,
        rowCount: 0,
        added: 0,
        updated: 0,
        rowErrors: parsed.rowErrors,
        months: [],
      },
      transactions: [],
    };
  }
  const { added, updated } = mergeById(existing, parsed.transactions);
  const months = [...new Set(parsed.transactions.map((t) => t.ym))].sort();
  return {
    result: {
      fileName,
      ok: true,
      encoding: decoded.encoding,
      rowCount: parsed.transactions.length,
      added,
      updated,
      rowErrors: parsed.rowErrors,
      months,
    },
    transactions: parsed.transactions,
  };
}

export function summarize(files: FileImportResult[]): ImportSummary {
  return {
    files,
    added: files.reduce((s, f) => s + f.added, 0),
    updated: files.reduce((s, f) => s + f.updated, 0),
    failed: files.filter((f) => !f.ok),
  };
}
