import type { ExclusionMap, ExclusionRule, Transaction } from './types';

const HEADER = ['計算対象', '日付', '内容', '金額（円）', '保有金融機関', '大項目', '中項目', 'メモ', '振替', 'ID', '除外ルール'];

/**
 * Excelで数式として解釈されないよう、= + - @ などで始まる文字列の先頭に ' を付ける
 * （CSVインジェクション対策）。金額などの数値はそのまま。
 */
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function quote(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

/**
 * 明細をCSV文字列にする（UTF-8 BOM付き・CRLF改行。ExcelでもMac/iPhoneでも文字化けしない）。
 * 列はマネーフォワードMEと同じ並び＋「除外ルール」。このアプリで再取り込みもできる。
 */
export function toCsv(transactions: Transaction[], excluded: ExclusionMap, rules: ExclusionRule[]): string {
  const names = new Map(rules.map((r) => [r.id, r.name]));
  const lines = [HEADER.map(quote).join(',')];
  for (const t of transactions) {
    const hits = excluded.get(t.id)?.map((id) => names.get(id) ?? id).join(' / ') ?? '';
    lines.push(
      [
        t.isTarget ? 1 : 0,
        t.date.replace(/-/g, '/'),
        safeText(t.content),
        t.amount,
        safeText(t.institution),
        safeText(t.large),
        safeText(t.middle),
        safeText(t.memo),
        t.isTransfer ? 1 : 0,
        t.id,
        safeText(hits),
      ]
        .map(quote)
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function exportFileName(prefix: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.csv`;
}
