import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Amount } from '../../components/Amount';
import { Card } from '../../components/Page';
import { formatYm, formatYmShort } from '../../lib/date';
import { formatYen } from '../../lib/format';
import { monthlySeries } from '../../lib/series';
import { useAppStore } from '../../store/useAppStore';
import { axisMonth, axisYen, EXPENSE, GRID, INCOME, INK, MUTED } from './chartTheme';
import { ChartTooltip, Legend, RangeChips, ScrollableChart } from './common';
import { useRangeMonths } from '../../hooks/useRangeMonths';

/** 月別の収入・支出（棒）と収支（折れ線） */
export function TrendView() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const setSummaryYm = useAppStore((s) => s.setSummaryYm);
  const setTab = useAppStore((s) => s.setTab);
  const months = useRangeMonths();
  const data = useMemo(() => monthlySeries(transactions, excluded, months), [transactions, excluded, months]);

  const sum = data.reduce((a, p) => ({ income: a.income + p.income, expense: a.expense + p.expense }), { income: 0, expense: 0 });
  const n = data.length || 1;
  // 一覧の表：7桁以上の金額があるか
  const wide = data.some((p) => Math.max(p.income, p.expense, Math.abs(p.balance)) >= 1_000_000);

  return (
    <>
      <RangeChips />
      <Card title="月別の収入・支出と収支">
        <Legend
          items={[
            { label: '収入', color: INCOME },
            { label: '支出', color: EXPENSE },
            { label: '収支', color: INK, line: true },
          ]}
        />
        <ScrollableChart count={data.length} minPerMonth={data.length > 24 ? 18 : 26}>
          {(width) => (
            <ComposedChart width={width} height={240} data={data} margin={{ top: 8, right: 0, bottom: 0, left: 8 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="ym" tickFormatter={axisMonth} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis orientation="right" tickFormatter={axisYen} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={56} />
              <ReferenceLine y={0} stroke={MUTED} />
              <Tooltip
                cursor={{ fill: 'var(--color-hover)' }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload;
                  if (!p) return null;
                  return (
                    <ChartTooltip
                      title={formatYm(p.ym)}
                      rows={[
                        { label: '収入', value: p.income, color: INCOME },
                        { label: '支出', value: p.expense, color: EXPENSE },
                        { label: '収支', value: p.balance, color: INK },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="income" name="収入" fill={INCOME} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expense" name="支出" fill={EXPENSE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line dataKey="balance" name="収支" stroke={INK} strokeWidth={2} dot={data.length <= 24 ? { r: 3, fill: INK, strokeWidth: 0 } : false} isAnimationActive={false} />
            </ComposedChart>
          )}
        </ScrollableChart>
      </Card>

      <Card title={`${formatYm(months[0] ?? '')} 〜 ${formatYm(months[months.length - 1] ?? '')}`}>
        <dl className="tabular grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <dt className="text-xs text-muted">収入合計</dt>
            <dd className="font-bold text-income">{formatYen(sum.income)}</dd>
            <dd className="text-xs text-muted">月平均 {formatYen(sum.income / n)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">支出合計</dt>
            <dd className="font-bold text-expense">{formatYen(sum.expense)}</dd>
            <dd className="text-xs text-muted">月平均 {formatYen(sum.expense / n)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">収支</dt>
            <dd className="font-bold">
              <Amount value={sum.income - sum.expense} />
            </dd>
            <dd className="text-xs text-muted">月平均 {formatYen((sum.income - sum.expense) / n)}</dd>
          </div>
        </dl>
      </Card>

      <Card title="月別の一覧">
        {/* 金額の桁が多い月でも数字がくっつかないよう、月は短く書き、列の間を空ける。100万円以上の月があるときは文字を小さくして幅 375px に収め、それでも収まらないときは横にスクロールする */}
        <div className="overflow-x-auto">
        <table className={`tabular w-full whitespace-nowrap ${wide ? 'text-xs' : 'text-sm'}`}>
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">月</th>
              <th className="py-1 pl-2 text-right font-normal">収入</th>
              <th className="py-1 pl-2 text-right font-normal">支出</th>
              <th className="py-1 pl-2 text-right font-normal">収支</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...data].reverse().map((p) => (
              <tr
                key={p.ym}
                onClick={() => {
                  setSummaryYm(p.ym);
                  setTab('summary');
                }}
                className="h-11 cursor-pointer active:bg-bg"
              >
                <td className="py-2.5">{formatYmShort(p.ym)}</td>
                <td className="py-2.5 pl-2 text-right">{formatYen(p.income)}</td>
                <td className="py-2.5 pl-2 text-right">{formatYen(p.expense)}</td>
                <td className="py-2.5 pl-2 text-right">
                  <Amount value={p.balance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="mt-2 text-xs text-muted">月をタップすると、その月の集計を表示します。</p>
      </Card>
    </>
  );
}
