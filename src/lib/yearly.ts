import type { ExclusionMap, Transaction } from './types';

export interface YearTotal {
  year: string;
  income: number;
  expense: number;
  balance: number;
  /** データのある月数（年の途中から／途中までのデータを見分けるため） */
  months: number;
}

/** 年ごとの収入・支出・収支（新しい年が先）。除外分は含めない */
export function yearlyTotals(transactions: Iterable<Transaction>, excluded: ExclusionMap): YearTotal[] {
  const map = new Map<string, YearTotal & { ymSet: Set<string> }>();
  for (const t of transactions) {
    const year = t.date.slice(0, 4);
    let y = map.get(year);
    if (!y) {
      y = { year, income: 0, expense: 0, balance: 0, months: 0, ymSet: new Set() };
      map.set(year, y);
    }
    y.ymSet.add(t.ym);
    if (excluded.has(t.id)) continue;
    if (t.amount > 0) y.income += t.amount;
    else y.expense += -t.amount;
  }
  return [...map.values()]
    .map(({ ymSet, ...y }) => ({ ...y, balance: y.income - y.expense, months: ymSet.size }))
    .sort((a, b) => (a.year < b.year ? 1 : -1));
}

/** 指定した年の明細 */
export function transactionsOfYear(transactions: Transaction[], year: string): Transaction[] {
  return transactions.filter((t) => t.date.startsWith(year));
}

/** 指定した年の、指定した月（'01'〜'12'）だけの明細。前年同期比の計算に使う */
export function transactionsOfYearMonths(transactions: Transaction[], year: string, monthNums: Set<string>): Transaction[] {
  return transactions.filter((t) => t.date.startsWith(year) && monthNums.has(t.ym.slice(5)));
}

/** その年にデータのある月（'01'〜'12'） */
export function monthsWithData(transactions: Transaction[], year: string): Set<string> {
  const s = new Set<string>();
  for (const t of transactions) if (t.date.startsWith(year)) s.add(t.ym.slice(5));
  return s;
}
