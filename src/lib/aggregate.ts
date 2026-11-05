import type { ExclusionMap, Transaction } from './types';

export interface Totals {
  income: number;
  /** 支出合計（正の数） */
  expense: number;
  balance: number;
  count: number;
  excludedCount: number;
}

/** 収入・支出・収支を集計する（除外された明細は含めない） */
export function totals(transactions: Iterable<Transaction>, excluded: ExclusionMap): Totals {
  let income = 0;
  let expense = 0;
  let count = 0;
  let excludedCount = 0;
  for (const t of transactions) {
    if (excluded.has(t.id)) {
      excludedCount++;
      continue;
    }
    count++;
    if (t.amount > 0) income += t.amount;
    else expense += -t.amount;
  }
  return { income, expense, balance: income - expense, count, excludedCount };
}

/** 年月ごとに明細をまとめる */
export function groupByMonth(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = map.get(t.ym);
    if (list) list.push(t);
    else map.set(t.ym, [t]);
  }
  return map;
}

export interface MonthInfo {
  ym: string;
  count: number;
}

/** データに含まれる年月の一覧（新しい順） */
export function listMonths(transactions: Transaction[]): MonthInfo[] {
  const counts = new Map<string, number>();
  for (const t of transactions) counts.set(t.ym, (counts.get(t.ym) ?? 0) + 1);
  return [...counts.entries()].map(([ym, count]) => ({ ym, count })).sort((a, b) => (a.ym < b.ym ? 1 : -1));
}

export interface CategoryTotal {
  name: string;
  amount: number;
  count: number;
}

/** 大項目（または中項目）別の支出合計（多い順）。除外は含めない */
export function expenseByCategory(
  transactions: Iterable<Transaction>,
  excluded: ExclusionMap,
  key: 'large' | 'middle' = 'large',
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const t of transactions) {
    if (t.amount >= 0 || excluded.has(t.id)) continue;
    const name = t[key];
    const cur = map.get(name) ?? { name, amount: 0, count: 0 };
    cur.amount += -t.amount;
    cur.count++;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** データの期間（最古日・最新日） */
export function dateRange(transactions: Transaction[]): { from: string; to: string } | null {
  if (transactions.length === 0) return null;
  let from = transactions[0].date;
  let to = from;
  for (const t of transactions) {
    if (t.date < from) from = t.date;
    if (t.date > to) to = t.date;
  }
  return { from, to };
}

/** 日付の降順（同じ日はCSVの並び順）に並べる */
export function sortByDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.date === b.date ? a.row - b.row : a.date < b.date ? 1 : -1));
}

/** 値の一覧（重複なし、五十音順）。選択肢を作るのに使う */
export function uniqueValues(transactions: Transaction[], key: 'large' | 'middle' | 'institution'): string[] {
  return [...new Set(transactions.map((t) => t[key]))].filter((v) => v !== '').sort((a, b) => a.localeCompare(b, 'ja'));
}

/** 大項目 → 中項目の一覧 */
export function middleByLarge(transactions: Transaction[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const t of transactions) {
    const s = map.get(t.large) ?? new Set<string>();
    s.add(t.middle);
    map.set(t.large, s);
  }
  return new Map([...map.entries()].map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b, 'ja'))]));
}
