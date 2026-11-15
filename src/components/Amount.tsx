import { formatYen } from '../lib/format';

interface Props {
  value: number;
  /** 支出を正の数で渡すとき true（色は支出、表示は¥のみ） */
  asExpense?: boolean;
  muted?: boolean;
  /** 灰色の背景（bg）の上に小さく置くとき true。支出の赤を、コントラストが足りる濃い赤（danger）にする */
  onBg?: boolean;
  className?: string;
}

/** 金額表示：支出は赤、収入は緑 */
export function Amount({ value, asExpense, muted, onBg, className = '' }: Props) {
  const isExpense = asExpense || value < 0;
  const color = muted ? 'text-muted' : isExpense ? (onBg ? 'text-danger' : 'text-expense') : value > 0 ? 'text-income' : 'text-ink';
  const text = asExpense ? formatYen(Math.abs(value)) : formatYen(value);
  return <span className={`tabular whitespace-nowrap ${color} ${className}`}>{text}</span>;
}
