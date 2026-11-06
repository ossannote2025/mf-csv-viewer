import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChangeText } from '../../components/ChangeText';
import { Card } from '../../components/Page';
import { expenseByCategory } from '../../lib/aggregate';
import { formatYm, shiftYm } from '../../lib/date';
import { formatYen } from '../../lib/format';
import { categoryMonthMatrix, change, monthlySeries, stableSlots, ymRange } from '../../lib/series';
import { useAppStore } from '../../store/useAppStore';
import { axisMonth, axisYen, EXPENSE, GRID, MUTED, SERIES } from './chartTheme';
import { ChartTooltip, RangeChips, ScrollableChart } from './common';
import { useRangeMonths } from '../../hooks/useRangeMonths';

/** カテゴリ別の月次推移（グラフ＋表）、前月比・前年同月比 */
export function CategoryView() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const months = useRangeMonths();
  const [large, setLarge] = useState<string | null>(null);
  const [middle, setMiddle] = useState<string | null>(null);

  const oldestYm = transactions[transactions.length - 1]?.ym ?? '';
  // 前年同月比のため、表示期間の12か月前から計算する
  const ext = useMemo(() => (months.length ? ymRange(shiftYm(months[0], -12), months[months.length - 1]) : []), [months]);
  const offset = ext.length - months.length;

  const largeMatrix = useMemo(() => categoryMonthMatrix(transactions, excluded, ext, 'large'), [transactions, excluded, ext]);
  const middleMatrix = useMemo(
    () => (large ? categoryMonthMatrix(transactions, excluded, ext, 'middle', large) : null),
    [transactions, excluded, ext, large],
  );
  const totalSeries = useMemo(() => monthlySeries(transactions, excluded, ext).map((p) => p.expense), [transactions, excluded, ext]);
  const slots = useMemo(() => stableSlots(expenseByCategory(transactions, excluded, 'large'), SERIES.length), [transactions, excluded]);

  const values = (middle && middleMatrix?.get(middle)) || (large && largeMatrix.get(large)) || (large ? new Array(ext.length).fill(0) : totalSeries);
  const color = large && slots.has(large) ? SERIES[slots.get(large)!] : EXPENSE;
  const label = middle ? `${large}／${middle}` : large ?? '支出合計';

  const rows = months.map((ym, i) => {
    const j = i + offset;
    const prevYm = shiftYm(ym, -1);
    const lastYearYm = shiftYm(ym, -12);
    return {
      ym,
      amount: values[j],
      mom: change(values[j], prevYm >= oldestYm ? values[j - 1] : undefined),
      yoy: change(values[j], lastYearYm >= oldestYm ? values[j - 12] : undefined),
    };
  });
  const chartData = rows.map((r) => ({ ym: r.ym, amount: r.amount }));

  // 表（カテゴリ×月）：大項目を選んでいるときはその中項目
  const matrix = large ? middleMatrix! : largeMatrix;
  const matrixRows = [...matrix.entries()]
    .map(([name, v]) => ({ name, v: v.slice(offset), total: v.slice(offset).reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const larges = [...largeMatrix.entries()].filter(([, v]) => v.slice(offset).some((x) => x > 0)).map(([k]) => k);
  const middles = middleMatrix ? [...middleMatrix.keys()] : [];

  return (
    <>
      <RangeChips />
      <div className="mx-4 mt-3 flex gap-2">
        <select
          value={large ?? ''}
          onChange={(e) => {
            setLarge(e.target.value || null);
            setMiddle(null);
          }}
          className="h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 shadow-sm"
          aria-label="大項目"
        >
          <option value="">支出合計</option>
          {larges.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {large && (
          <select value={middle ?? ''} onChange={(e) => setMiddle(e.target.value || null)} className="h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 shadow-sm" aria-label="中項目">
            <option value="">中項目すべて</option>
            {middles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      <Card title={`${label}の推移`}>
        <ScrollableChart count={chartData.length} minPerMonth={chartData.length > 24 ? 14 : 22} height={200}>
          {(width) => (
            <BarChart width={width} height={200} data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="ym" tickFormatter={axisMonth} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis orientation="right" tickFormatter={axisYen} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={56} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload;
                  return p ? <ChartTooltip title={formatYm(p.ym)} rows={[{ label, value: p.amount, color }]} /> : null;
                }}
              />
              <Bar dataKey="amount" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ScrollableChart>
      </Card>

      <Card title={`${label}：前月比・前年同月比`}>
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">月</th>
              <th className="py-1 text-right font-normal">支出</th>
              <th className="py-1 text-right font-normal">前月比</th>
              <th className="py-1 text-right font-normal">前年同月比</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...rows].reverse().map((r) => (
              <tr key={r.ym}>
                <td className="py-2 whitespace-nowrap">{formatYm(r.ym).replace('年', '/').replace('月', '')}</td>
                <td className="py-2 text-right">{formatYen(r.amount)}</td>
                <td className="py-2 text-right text-xs">
                  <ChangeText c={r.mom} showRatio={false} />
                </td>
                <td className="py-2 text-right text-xs">
                  <ChangeText c={r.yoy} showRatio={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">▲は増加、▼は減少。比較する月のデータがない場合は「—」です。</p>
      </Card>

      <Card title={large ? `${large}の中項目×月` : '大項目×月'}>
        {matrixRows.length === 0 ? (
          <p className="text-sm text-muted">この期間の支出はありません。</p>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="tabular text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="sticky left-0 bg-surface py-1 pr-2 pl-4 text-left font-normal">項目</th>
                  <th className="px-2 py-1 text-right font-normal whitespace-nowrap">合計</th>
                  {[...months].reverse().map((ym) => (
                    <th key={ym} className="px-2 py-1 text-right font-normal whitespace-nowrap">
                      {formatYm(ym).replace('年', '/').replace('月', '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {matrixRows.map((r) => {
                  const selected = large ? middle === r.name : false;
                  return (
                    <tr
                      key={r.name}
                      onClick={() => (large ? setMiddle(selected ? null : r.name) : (setLarge(r.name), setMiddle(null)))}
                      className={`cursor-pointer active:bg-bg ${selected ? 'bg-accent-soft' : ''}`}
                    >
                      <td className={`sticky left-0 max-w-32 truncate py-2 pr-2 pl-4 ${selected ? 'bg-accent-soft' : 'bg-surface'}`}>{r.name}</td>
                      <td className="px-2 py-2 text-right font-bold whitespace-nowrap">{formatYen(r.total)}</td>
                      {[...r.v].reverse().map((x, i) => (
                        <td key={i} className={`px-2 py-2 text-right whitespace-nowrap ${x === 0 ? 'text-muted' : ''}`}>
                          {x === 0 ? '—' : formatYen(x)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{large ? '中項目をタップすると、グラフと比較表をその中項目に切り替えます。' : '大項目をタップすると、その大項目の推移と中項目の内訳を表示します。'}</p>
      </Card>
    </>
  );
}
