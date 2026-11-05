import { normalizeForSearch } from './format';
import type { ExclusionMap, Transaction } from './types';

export interface TransactionFilter {
  keyword: string;
  dateFrom: string;
  dateTo: string;
  large: string[];
  middle: string[];
  institutions: string[];
  flow: 'all' | 'income' | 'expense';
  amountMin?: number;
  amountMax?: number;
  showExcluded: boolean;
}

export const EMPTY_FILTER: TransactionFilter = {
  keyword: '',
  dateFrom: '',
  dateTo: '',
  large: [],
  middle: [],
  institutions: [],
  flow: 'all',
  amountMin: undefined,
  amountMax: undefined,
  showExcluded: true,
};

/** キーワード以外で有効な条件の数（ボタンのバッジ表示用） */
export function activeFilterCount(f: TransactionFilter): number {
  let n = 0;
  if (f.dateFrom || f.dateTo) n++;
  if (f.large.length) n++;
  if (f.middle.length) n++;
  if (f.institutions.length) n++;
  if (f.flow !== 'all') n++;
  if (f.amountMin !== undefined || f.amountMax !== undefined) n++;
  return n;
}

const searchKeyCache = new WeakMap<Transaction, string>();
function searchKey(t: Transaction): string {
  let k = searchKeyCache.get(t);
  if (k === undefined) {
    k = normalizeForSearch(`${t.content}\n${t.memo}`);
    searchKeyCache.set(t, k);
  }
  return k;
}

/** 絞り込み。キーワードは空白区切りでAND、内容・メモが対象。金額範囲は絶対値で比較 */
export function applyFilter(transactions: Transaction[], f: TransactionFilter, excluded: ExclusionMap): Transaction[] {
  const words = normalizeForSearch(f.keyword).split(/\s+/).filter(Boolean);
  const large = f.large.length ? new Set(f.large) : null;
  const middle = f.middle.length ? new Set(f.middle) : null;
  const inst = f.institutions.length ? new Set(f.institutions) : null;
  return transactions.filter((t) => {
    if (!f.showExcluded && excluded.has(t.id)) return false;
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    if (large && !large.has(t.large)) return false;
    if (middle && !middle.has(t.middle)) return false;
    if (inst && !inst.has(t.institution)) return false;
    if (f.flow === 'income' && !(t.amount > 0)) return false;
    if (f.flow === 'expense' && !(t.amount < 0)) return false;
    const abs = Math.abs(t.amount);
    if (f.amountMin !== undefined && abs < f.amountMin) return false;
    if (f.amountMax !== undefined && abs > f.amountMax) return false;
    if (words.length) {
      const key = searchKey(t);
      for (const w of words) if (!key.includes(w)) return false;
    }
    return true;
  });
}

/** 'YYYY-MM' の月初・月末 */
export function monthRange(ym: string): { dateFrom: string; dateTo: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dateFrom: `${ym}-01`, dateTo: `${ym}-${String(last).padStart(2, '0')}` };
}
