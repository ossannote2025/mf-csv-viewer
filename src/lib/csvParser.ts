import Papa from 'papaparse';
import { normalizeDate } from './date';
import type { Transaction } from './types';

/** 内部フィールド名と、CSVヘッダーでの名前（正規化後） */
const COLUMNS = {
  isTarget: '計算対象',
  date: '日付',
  content: '内容',
  amount: '金額(円)',
  institution: '保有金融機関',
  large: '大項目',
  middle: '中項目',
  memo: 'メモ',
  isTransfer: '振替',
  id: 'ID',
} as const;

type ColumnKey = keyof typeof COLUMNS;

const REQUIRED: ColumnKey[] = ['date', 'content', 'amount', 'id'];

/** ヘッダーの表記ゆれを吸収する（全角カッコ・空白・BOM・引用符など） */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .replace(/["'\s]/g, '')
    .toUpperCase();
}

/** 金額の文字列を数値に。'-1,234'・'¥1,234'・'−1234' にも対応。不正なら null */
export function parseAmount(raw: string): number | null {
  const s = raw.normalize('NFKC').replace(/[,¥\\\s円]/g, '').replace(/[−‐–ー]/g, '-');
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export interface RowError {
  /** CSVの行番号（ヘッダー行=1） */
  line: number;
  message: string;
}

export interface ParseResult {
  fileName: string;
  /** ファイル全体が読めなかったときのエラー */
  fileError?: string;
  transactions: Transaction[];
  /** 読み飛ばした行 */
  rowErrors: RowError[];
}

function flag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const s = raw.normalize('NFKC').trim();
  if (s === '') return defaultValue;
  return s === '1';
}

/** デコード済みのCSV文字列を明細に変換する */
export function parseMfCsv(text: string, fileName: string, importedAt = Date.now()): ParseResult {
  const result: ParseResult = { fileName, transactions: [], rowErrors: [] };
  const body = text.replace(/^\uFEFF/, '');
  if (body.trim() === '') {
    result.fileError = 'ファイルが空です。';
    return result;
  }

  // 区切り文字はカンマ・タブを自動判定
  const parsed = Papa.parse<string[]>(body, { skipEmptyLines: 'greedy', delimitersToGuess: [',', '\t'] });
  const rows = parsed.data;
  if (rows.length === 0) {
    result.fileError = 'ファイルにデータがありません。';
    return result;
  }

  const header = rows[0].map(normalizeHeader);
  const index = {} as Record<ColumnKey, number>;
  for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
    index[key] = header.indexOf(normalizeHeader(COLUMNS[key]));
  }
  const missing = REQUIRED.filter((k) => index[k] < 0).map((k) => `「${COLUMNS[k].replace('(円)', '（円）')}」`);
  if (missing.length > 0) {
    const found = rows[0].slice(0, 12).join(' / ');
    result.fileError =
      `マネーフォワードMEの「収入・支出詳細」CSVではないようです。` +
      `1行目に ${missing.join('・')} の列が見つかりません（1行目の内容: ${found || '空'}）。`;
    return result;
  }

  const get = (row: string[], key: ColumnKey): string | undefined =>
    index[key] >= 0 ? (row[index[key]] ?? '').trim() : undefined;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    if (row.every((c) => c.trim() === '')) continue;

    const id = get(row, 'id') ?? '';
    if (id === '') {
      result.rowErrors.push({ line, message: 'IDが空です' });
      continue;
    }
    const rawDate = get(row, 'date') ?? '';
    const date = normalizeDate(rawDate);
    if (!date) {
      result.rowErrors.push({ line, message: `日付の形式が正しくありません（"${rawDate}"）` });
      continue;
    }
    const rawAmount = get(row, 'amount') ?? '';
    const amount = parseAmount(rawAmount);
    if (amount === null) {
      result.rowErrors.push({ line, message: `金額が数値ではありません（"${rawAmount}"）` });
      continue;
    }

    result.transactions.push({
      id,
      date,
      ym: date.slice(0, 7),
      content: get(row, 'content') ?? '',
      amount,
      institution: get(row, 'institution') ?? '',
      large: get(row, 'large') || '未分類',
      middle: get(row, 'middle') || '未分類',
      memo: get(row, 'memo') ?? '',
      isTarget: flag(get(row, 'isTarget'), true),
      isTransfer: flag(get(row, 'isTransfer'), false),
      sourceFile: fileName,
      row: line,
      importedAt,
    });
  }

  if (result.transactions.length === 0 && result.rowErrors.length > 0) {
    result.fileError = `読み込める行がありませんでした（${result.rowErrors[0].line}行目: ${result.rowErrors[0].message} など）。`;
  }
  return result;
}
