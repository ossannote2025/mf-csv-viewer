import { useMemo } from 'react';
import { Amount } from '../../components/Amount';
import { ChangeText } from '../../components/ChangeText';
import { ChevronLeft, ChevronRight } from '../../components/Icons';
import { Card } from '../../components/Page';
import { PeriodSwipeArea } from '../../components/PeriodSwipeArea';
import { formatYen } from '../../lib/format';
import { change, monthlySeries, ymRange } from '../../lib/series';
import { monthsWithData, transactionsOfYear, transactionsOfYearMonths, yearlyTotals } from '../../lib/yearly';
import { expenseByCategory, totals } from '../../lib/aggregate';
import { useAppStore } from '../../store/useAppStore';

/** 年間レポート：年の合計、月別、支出カテゴリのランキング、年比較 */
export function YearReport() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const selected = useAppStore((s) => s.reportYear);
  const setYear = useAppStore((s) => s.setReportYear);
  const setSummaryYm = useAppStore((s) => s.setSummaryYm);
  const setSummaryMode = useAppStore((s) => s.setSummaryMode);
  const showTransactions = useAppStore((s) => s.showTransactions);

  const years = useMemo(() => yearlyTotals(transactions, excluded), [transactions, excluded]);
  const yearValues = useMemo(() => years.map((y) => y.year), [years]);
  const year = selected && years.some((y) => y.year === selected) ? selected : years[0]?.year;
  const idx = years.findIndex((y) => y.year === year);
  const cur = years[idx];
  const prevYear = year ? String(Number(year) - 1) : '';
  const hasPrev = years.some((y) => y.year === prevYear);

  // 前年は「今年データのある月」と同じ月だけで比べる（年の途中までのデータでも公平に比較するため）
  const { prev, ranking, partial } = useMemo(() => {
    if (!year) return { prev: null, ranking: [], partial: false };
    const months = monthsWithData(transactions, year);
    const lastList = transactionsOfYearMonths(transactions, prevYear, months);
    const lastCats = new Map(expenseByCategory(lastList, excluded).map((c) => [c.name, c.amount]));
    const now = expenseByCategory(transactionsOfYear(transactions, year), excluded);
    return {
      prev: totals(lastList, excluded),
      ranking: now.map((c) => ({ ...c, last: lastCats.get(c.name) })),
      partial: months.size < 12,
    };
  }, [transactions, excluded, year, prevYear]);
  const cmpLabel = partial ? '前年同期比' : '前年比';

  const months = useMemo(() => (year ? monthlySeries(transactions, excluded, ymRange(`${year}-01`, `${year}-12`)) : []), [transactions, excluded, year]);

  if (!year || !cur) return null;
  const maxYearExpense = Math.max(...years.map((y) => Math.max(y.expense, y.income)), 1);
  const maxMonth = Math.max(...months.map((m) => Math.max(m.expense, m.income)), 1);
  const yearRange = { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };

  return (
    <PeriodSwipeArea values={yearValues} value={year} onChange={setYear}>
      <div className="mx-4 mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={idx >= years.length - 1}
          onClick={() => setYear(years[idx + 1].year)}
          className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm disabled:opacity-30"
          aria-label="前の年"
        >
          <ChevronLeft />
        </button>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="h-11 flex-1 rounded-xl bg-surface px-3 text-center font-bold shadow-sm" aria-label="年を選ぶ">
          {years.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year}年
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={idx <= 0}
          onClick={() => setYear(years[idx - 1].year)}
          className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm disabled:opacity-30"
          aria-label="次の年"
        >
          <ChevronRight />
        </button>
      </div>

      <Card>
        <table className="tabular w-full">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">{year}年</th>
              <th className="py-1 text-right font-normal">合計</th>
              <th className="py-1 text-right font-normal">月平均</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="py-1.5 text-left text-sm font-normal text-muted">収入</th>
              <td className="py-1.5 text-right text-lg font-bold text-income">{formatYen(cur.income)}</td>
              <td className="py-1.5 text-right text-sm">{formatYen(cur.income / cur.months)}</td>
            </tr>
            <tr>
              <th className="py-1.5 text-left text-sm font-normal text-muted">支出</th>
              <td className="py-1.5 text-right text-lg font-bold text-expense">{formatYen(cur.expense)}</td>
              <td className="py-1.5 text-right text-sm">{formatYen(cur.expense / cur.months)}</td>
            </tr>
            <tr className="border-t border-line">
              <th className="py-2 text-left text-sm font-bold">収支</th>
              <td className="py-2 text-right text-xl font-bold">
                <Amount value={cur.balance} />
              </td>
              <td className="py-2 text-right text-sm">
                <Amount value={cur.balance / cur.months} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          データのある月：{cur.months}か月
          {partial && hasPrev && '。前年とは、データのある月と同じ月どうしで比べています（前年同期比）'}
        </p>
        {hasPrev && prev && (
          <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-bg p-2 text-center text-xs">
            {(['income', 'expense', 'balance'] as const).map((k) => (
              <div key={k}>
                <dt className="text-muted">
                  {cmpLabel}
                  <br />（{k === 'income' ? '収入' : k === 'expense' ? '支出' : '収支'}）
                </dt>
                <dd className="mt-0.5">
                  <ChangeText c={change(cur[k], prev[k])} showRatio={false} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="支出カテゴリのランキング">
        {ranking.length === 0 ? (
          <p className="text-sm text-muted">この年の支出はありません。</p>
        ) : (
          <ol className="-mx-2">
            {ranking.map((c, i) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => showTransactions({ ...yearRange, large: [c.name], flow: 'expense' })}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left active:bg-bg"
                >
                  <span className="tabular w-6 shrink-0 text-center text-sm font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <span className="tabular shrink-0 text-sm">{formatYen(c.amount)}</span>
                    </span>
                    <span className="mt-0.5 flex justify-between text-[11px] text-muted">
                      <span>{cur.expense > 0 ? `${Math.round((c.amount / cur.expense) * 1000) / 10}%` : ''}・月平均 {formatYen(c.amount / cur.months)}</span>
                      {hasPrev && (
                        <span>
                          {cmpLabel} <ChangeText c={change(c.amount, c.last ?? 0)} showRatio={false} />
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title={`${year}年の月別`}>
        <ul className="space-y-1">
          {months.map((m) => {
            const empty = m.income === 0 && m.expense === 0;
            return (
              <li key={m.ym}>
                <button
                  type="button"
                  disabled={empty}
                  onClick={() => {
                    setSummaryYm(m.ym);
                    setSummaryMode('month');
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left active:bg-bg disabled:opacity-40"
                >
                  <span className="tabular w-9 shrink-0 text-sm text-muted">{Number(m.ym.slice(5))}月</span>
                  <span className="flex flex-1 flex-col gap-0.5" aria-hidden="true">
                    <span className="h-1.5 rounded-full bg-income" style={{ width: `${(m.income / maxMonth) * 100}%` }} />
                    <span className="h-1.5 rounded-full bg-expense" style={{ width: `${(m.expense / maxMonth) * 100}%` }} />
                  </span>
                  <span className="w-24 shrink-0 text-right text-sm">{empty ? '—' : <Amount value={m.balance} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex gap-4 text-xs whitespace-nowrap text-muted">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-4 rounded-full bg-income" />
            収入
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-4 rounded-full bg-expense" />
            支出
          </span>
        </p>
        <p className="mt-1 text-xs text-muted">右の金額は収支です。月をタップすると、その月の集計を表示します。</p>
      </Card>

      <Card title="年ごとの比較">
        <ul className="divide-y divide-line">
          {years.map((y) => (
            <li key={y.year}>
              <button
                type="button"
                onClick={() => setYear(y.year)}
                className={`w-full py-2 text-left ${y.year === year ? 'font-bold' : ''}`}
                aria-current={y.year === year ? 'true' : undefined}
              >
                <span className="flex items-baseline justify-between text-sm">
                  <span>
                    {y.year}年{y.months < 12 && <span className="ml-1 text-xs font-normal text-muted">（{y.months}か月分）</span>}
                  </span>
                  <span className="tabular">
                    収支 <Amount value={y.balance} />
                  </span>
                </span>
                <span className="mt-1 flex flex-col gap-0.5" aria-hidden="true">
                  <span className="h-1.5 rounded-full bg-income" style={{ width: `${(y.income / maxYearExpense) * 100}%` }} />
                  <span className="h-1.5 rounded-full bg-expense" style={{ width: `${(y.expense / maxYearExpense) * 100}%` }} />
                </span>
                <span className="tabular mt-1 flex justify-between text-xs font-normal text-muted">
                  <span>収入 {formatYen(y.income)}</span>
                  <span>支出 {formatYen(y.expense)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </PeriodSwipeArea>
  );
}
