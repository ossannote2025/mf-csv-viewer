import { formatYen } from '../lib/format';

interface Props {
  value: number;
  /** 支出を正の数で渡すとき true（色は支出、表示は¥のみ） */
  asExpense?: boolean;
  muted?: boolean;
  className?: string;
}

/** 金額表示：支出は赤、収入は緑 */
export function Amount({ value, asExpense, muted, className = '' }: Props) {
  const isExpense = asExpense || value < 0;
  const color = muted ? 'text-muted' : isExpense ? 'text-expense' : value > 0 ? 'text-income' : 'text-ink';
  const text = asExpense ? formatYen(Math.abs(value)) : formatYen(value);
  return <span className={`tabular whitespace-nowrap ${color} ${className}`}>{text}</span>;
}
