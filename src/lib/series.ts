import { shiftYm } from './date';
import type { ExclusionMap, Transaction } from './types';

/** fromYm 〜 toYm の年月の配列（両端を含む、古い順） */
export function ymRange(fromYm: string, toYm: string): string[] {
  if (fromYm > toYm) return [];
  const out: string[] = [];
  for (let ym = fromYm; ym <= toYm; ym = shiftYm(ym, 1)) out.push(ym);
  return out;
}

export type RangePreset = '12m' | '24m' | '5y' | 'all';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: '12m', label: '12か月' },
  { value: '24m', label: '2年' },
  { value: '5y', label: '5年' },
  { value: 'all', label: '全期間' },
];

/** プリセットから期間（年月）を求める。基準はデータの最新月・最古月（年月を直書きしない） */
export function presetRange(preset: RangePreset, oldestYm: string, latestYm: string): { from: string; to: string } {
  const back = preset === '12m' ? 11 : preset === '24m' ? 23 : preset === '5y' ? 59 : Infinity;
  const from = back === Infinity ? oldestYm : shiftYm(latestYm, -back);
  return { from: from < oldestYm ? oldestYm : from, to: latestYm };
}

export interface MonthPoint {
  ym: string;
  income: number;
  /** 正の数 */
  expense: number;
  balance: number;
}

/** 月ごとの収入・支出・収支（データのない月も0で埋める）。除外分は含めない */
export function monthlySeries(transactions: Iterable<Transaction>, excluded: ExclusionMap, months: string[]): MonthPoint[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = months.map((ym) => ({ ym, income: 0, expense: 0, balance: 0 }));
  for (const t of transactions) {
    const i = idx.get(t.ym);
    if (i === undefined || excluded.has(t.id)) continue;
    if (t.amount > 0) out[i].income += t.amount;
    else out[i].expense += -t.amount;
  }
  for (const p of out) p.balance = p.income - p.expense;
  return out;
}

/**
 * カテゴリ × 月 の支出合計（正の数）。
 * key='middle' のときは parentLarge の大項目に属する中項目だけを対象にする。
 */
export function categoryMonthMatrix(
  transactions: Iterable<Transaction>,
  excluded: ExclusionMap,
  months: string[],
  key: 'large' | 'middle' = 'large',
  parentLarge?: string,
): Map<string, number[]> {
  const idx = new Map(months.map((m, i) => [m, i]));
  const map = new Map<string, number[]>();
  for (const t of transactions) {
    if (t.amount >= 0 || excluded.has(t.id)) continue;
    if (key === 'middle' && parentLarge !== undefined && t.large !== parentLarge) continue;
    const i = idx.get(t.ym);
    if (i === undefined) continue;
    const name = t[key];
    let row = map.get(name);
    if (!row) {
      row = new Array(months.length).fill(0);
      map.set(name, row);
    }
    row[i] += -t.amount;
  }
  return map;
}

export interface Change {
  diff: number;
  /** 変化率（前の値が0のときは null） */
  ratio: number | null;
}

/** 前月比・前年同月比などの増減 */
export function change(current: number, previous: number | undefined): Change | null {
  if (previous === undefined) return null;
  return { diff: current - previous, ratio: previous === 0 ? null : (current - previous) / previous };
}

export interface InstitutionTotal {
  name: string;
  income: number;
  expense: number;
  count: number;
}

/** 金融機関別の収入・支出（支出の多い順）。除外分は含めない */
export function byInstitution(transactions: Iterable<Transaction>, excluded: ExclusionMap): InstitutionTotal[] {
  const map = new Map<string, InstitutionTotal>();
  for (const t of transactions) {
    if (excluded.has(t.id)) continue;
    const name = t.institution || '（不明）';
    const cur = map.get(name) ?? { name, income: 0, expense: 0, count: 0 };
    if (t.amount > 0) cur.income += t.amount;
    else cur.expense += -t.amount;
    cur.count++;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.expense - a.expense || b.income - a.income);
}

/**
 * 色の割り当て：全期間の支出が多い順に大項目へ色の枠を固定で割り当てる。
 * 月を切り替えても同じ大項目は同じ色になる（色は順位ではなく項目に付く）。
 * 枠を超えた項目は null（「その他」としてまとめる）。
 */
export function stableSlots(totals: { name: string; amount: number }[], slots: number): Map<string, number> {
  const sorted = [...totals].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ja'));
  return new Map(sorted.slice(0, slots).map((c, i) => [c.name, i]));
}
