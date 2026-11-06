/**
 * グラフの色。カテゴリ用の8色は固定順（色覚多様性に配慮して検証済みの並び）で使い、
 * 9番目以降は色を増やさず「その他」にまとめる。
 * 収入・支出はアプリ全体の色（緑・赤）に合わせる。
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
export const OTHER = '#a1a1aa';
export const INCOME = 'var(--color-income)';
export const EXPENSE = 'var(--color-expense)';
export const INK = 'var(--color-ink)';
export const GRID = 'var(--color-line)';
export const MUTED = 'var(--color-muted)';

/** 軸の目盛り：¥30万、¥1.2万、¥5,000 */
export function axisYen(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000) return `${sign}¥${Math.round((abs / 10000) * 10) / 10}万`;
  return `${sign}¥${abs.toLocaleString('ja-JP')}`;
}

/** 'YYYY-MM' → 軸ラベル（1月と先頭は年を付ける） */
export function axisMonth(ym: string, i: number): string {
  const [y, m] = ym.split('-');
  return i === 0 || m === '01' ? `${y.slice(2)}/${Number(m)}` : `${Number(m)}月`;
}
