import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight } from '../../components/Icons';
import { MonthPicker } from '../../components/MonthPicker';
import { Card } from '../../components/Page';
import { expenseByCategory } from '../../lib/aggregate';
import { formatYm } from '../../lib/date';
import { monthRange } from '../../lib/filter';
import { formatYen } from '../../lib/format';
import { stableSlots } from '../../lib/series';
import { useMonthData } from '../../hooks/useMonthData';
import { useAppStore } from '../../store/useAppStore';
import { OTHER, SERIES } from './chartTheme';

/** 支出の内訳（大項目 → 中項目 → 明細）のドーナツグラフ */
export function BreakdownView() {
  const { transactions, months, byMonth, ym } = useMonthData();
  const excluded = useAppStore((s) => s.excluded);
  const setSummaryYm = useAppStore((s) => s.setSummaryYm);
  const showTransactions = useAppStore((s) => s.showTransactions);
  const [large, setLarge] = useState<string | null>(null);

  const list = useMemo(() => (ym ? byMonth.get(ym) ?? [] : []), [byMonth, ym]);
  const cats = useMemo(
    () => (large ? expenseByCategory(list.filter((t) => t.large === large), excluded, 'middle') : expenseByCategory(list, excluded, 'large')),
    [list, excluded, large],
  );
  // 色は全期間の金額順で固定（月を変えても同じ項目は同じ色）
  const slots = useMemo(() => {
    const all = large ? transactions.filter((t) => t.large === large) : transactions;
    return stableSlots(expenseByCategory(all, excluded, large ? 'middle' : 'large'), SERIES.length);
  }, [transactions, excluded, large]);

  if (!ym) return null;
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const colorOf = (name: string) => {
    const i = slots.get(name);
    return i === undefined ? OTHER : SERIES[i];
  };
  // ドーナツは色の付く項目＋「その他」にまとめる
  const slices: { name: string; amount: number; color: string }[] = [];
  let other = 0;
  for (const c of cats) {
    if (slots.has(c.name)) slices.push({ name: c.name, amount: c.amount, color: colorOf(c.name) });
    else other += c.amount;
  }
  if (other > 0) slices.push({ name: 'その他', amount: other, color: OTHER });

  const select = (name: string) => {
    if (!large) setLarge(name);
    else showTransactions({ ...monthRange(ym), large: [large], middle: [name], flow: 'expense' });
  };

  return (
    <>
      <div className="mx-4 mt-4">
        <MonthPicker months={months} value={ym} onChange={setSummaryYm} />
      </div>
      <Card
        title={
          large ? (
            <button type="button" onClick={() => setLarge(null)} className="-my-2 -ml-2 flex min-h-11 items-center gap-1 px-2 text-accent">
              <ChevronLeft className="size-5" />
              大項目に戻る
            </button>
          ) : (
            '支出の内訳（大項目）'
          )
        }
      >
        {large && <p className="-mt-1 mb-2 font-bold">{large} の内訳</p>}
        {cats.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{formatYm(ym)}の支出はありません。</p>
        ) : (
          <>
            <div className="relative mx-auto h-56 max-w-xs">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    onClick={(d: { name?: string }) => d.name && d.name !== 'その他' && select(d.name)}
                  >
                    {slices.map((s) => (
                      <Cell key={s.name} fill={s.color} className={s.name === 'その他' ? '' : 'cursor-pointer'} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted">{large ?? `${formatYm(ym)}の支出`}</span>
                <span className="tabular text-xl font-bold">{formatYen(total)}</span>
              </div>
            </div>

            <ul className="-mx-2 mt-3">
              {cats.map((c) => (
                <li key={c.name}>
                  <button type="button" onClick={() => select(c.name)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left active:bg-bg">
                    <span className="size-3 shrink-0 rounded-sm" style={{ background: colorOf(c.name) }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    <span className="tabular text-sm">{formatYen(c.amount)}</span>
                    <span className="tabular w-12 text-right text-xs text-muted">{Math.round((c.amount / total) * 1000) / 10}%</span>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              {large ? '中項目をタップすると、その明細の一覧を表示します。' : '大項目をタップすると、中項目の内訳を表示します。'}
            </p>
          </>
        )}
      </Card>
    </>
  );
}
