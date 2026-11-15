/**
 * グラフの色。カテゴリの色は src/lib/categoryColors.ts（カテゴリ名に固定）。
 * 収入・支出はアプリ全体の色（緑・赤）に合わせる。
 */
import { formatYenAxis } from '../../lib/format';

export const INCOME = 'var(--color-income)';
export const EXPENSE = 'var(--color-expense)';
export const INK = 'var(--color-ink)';
export const GRID = 'var(--color-line)';
export const MUTED = 'var(--color-muted)';

/** 軸の目盛り：¥1.3億、¥30万、¥1.2万、¥5,000 */
export const axisYen = formatYenAxis;

/** 'YYYY-MM' → 軸ラベル（1月と先頭は年を付ける） */
export function axisMonth(ym: string, i: number): string {
  const [y, m] = ym.split('-');
  return i === 0 || m === '01' ? `${y.slice(2)}/${Number(m)}` : `${Number(m)}月`;
}
