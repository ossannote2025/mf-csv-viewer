import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MonthPicker } from '../../components/MonthPicker';
import { Card } from '../../components/Page';
import { formatYm } from '../../lib/date';
import { monthRange } from '../../lib/filter';
import { formatCount, formatYen } from '../../lib/format';
import { byInstitution, RANGE_PRESETS } from '../../lib/series';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useMonthData } from '../../hooks/useMonthData';
import { useRangeMonths } from '../../hooks/useRangeMonths';
import { useAppStore } from '../../store/useAppStore';
import { axisYen, EXPENSE, GRID, MUTED } from './chartTheme';
import { ChartTooltip } from './common';

/** 金融機関別の集計 */
export function InstitutionView() {
  const { transactions, months, byMonth, ym } = useMonthData();
  const excluded = useAppStore((s) => s.excluded);
  const chartRange = useAppStore((s) => s.chartRange);
  const setChartRange = useAppStore((s) => s.setChartRange);
  const setSummaryYm = useAppStore((s) => s.setSummaryYm);
  const showTransactions = useAppStore((s) => s.showTransactions);
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const rangeMonths = useRangeMonths();
  const [ref, width] = useElementWidth<HTMLDivElement>();

  const period = useMemo(() => {
    if (mode === 'month' && ym) return { ...monthRange(ym), label: formatYm(ym) };
    const from = rangeMonths[0];
    const to = rangeMonths[rangeMonths.length - 1];
    return { dateFrom: monthRange(from).dateFrom, dateTo: monthRange(to).dateTo, label: `${formatYm(from)}〜${formatYm(to)}` };
  }, [mode, ym, rangeMonths]);

  const rows = useMemo(() => {
    const list =
      mode === 'month' && ym ? byMonth.get(ym) ?? [] : transactions.filter((t) => t.date >= period.dateFrom && t.date <= period.dateTo);
    return byInstitution(list, excluded);
  }, [mode, ym, byMonth, transactions, period, excluded]);
  const expenseRows = rows.filter((r) => r.expense > 0);

  if (!ym) return null;
  return (
    <>
      <div className="flex gap-2 overflow-x-auto px-4 pt-4" role="group" aria-label="期間">
        <button
          type="button"
          aria-pressed={mode === 'month'}
          onClick={() => setMode('month')}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${mode === 'month' ? 'border-accent bg-accent font-bold text-on-accent' : 'border-line bg-surface'}`}
        >
          月ごと
        </button>
        {RANGE_PRESETS.map((p) => {
          const on = mode === 'range' && chartRange === p.value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setMode('range');
                setChartRange(p.value);
              }}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${on ? 'border-accent bg-accent font-bold text-on-accent' : 'border-line bg-surface'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {mode === 'month' && (
        <div className="mx-4 mt-3">
          <MonthPicker months={months} value={ym} onChange={setSummaryYm} />
        </div>
      )}

      <Card title={`金融機関別の支出（${period.label}）`}>
        {expenseRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">この期間の支出はありません。</p>
        ) : (
          <div ref={ref}>
            {width > 0 && (
              <BarChart width={width} height={expenseRows.length * 36 + 24} data={expenseRows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tickFormatter={axisYen} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={Math.min(120, width * 0.35)} tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--color-hover)' }}
                  content={({ active, payload }) => {
                    const p = active && payload?.[0]?.payload;
                    return p ? <ChartTooltip title={p.name} rows={[{ label: '支出', value: p.expense, color: EXPENSE }]} /> : null;
                  }}
                />
                <Bar dataKey="expense" fill={EXPENSE} radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false} />
              </BarChart>
            )}
          </div>
        )}
      </Card>

      <Card title="一覧">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">金融機関</th>
              <th className="py-1 text-right font-normal">支出</th>
              <th className="py-1 text-right font-normal">収入</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr
                key={r.name}
                onClick={() => showTransactions({ dateFrom: period.dateFrom, dateTo: period.dateTo, institutions: [r.name] })}
                className="cursor-pointer active:bg-bg"
              >
                <td className="py-2.5">
                  <span className="block max-w-40 truncate">{r.name}</span>
                  <span className="text-xs text-muted">{formatCount(r.count)}</span>
                </td>
                <td className="py-2.5 text-right text-expense">{r.expense ? formatYen(r.expense) : '—'}</td>
                <td className="py-2.5 text-right text-income">{r.income ? formatYen(r.income) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">除外された明細（振替・除外ルール）は含みません。金融機関をタップすると明細を表示します。</p>
      </Card>
    </>
  );
}
