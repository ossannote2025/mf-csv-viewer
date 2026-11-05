import { useMemo } from 'react';
import { Amount } from '../../components/Amount';
import { ChevronLeft, ChevronRight } from '../../components/Icons';
import { Card, Page } from '../../components/Page';
import { expenseByCategory, groupByMonth, listMonths, totals } from '../../lib/aggregate';
import { formatYm } from '../../lib/date';
import { monthRange } from '../../lib/filter';
import { formatYen } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';

export function SummaryTab() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const summaryYm = useAppStore((s) => s.summaryYm);
  const setSummaryYm = useAppStore((s) => s.setSummaryYm);
  const showTransactions = useAppStore((s) => s.showTransactions);

  const months = useMemo(() => listMonths(transactions), [transactions]);
  const byMonth = useMemo(() => groupByMonth(transactions), [transactions]);
  const ym = summaryYm && byMonth.has(summaryYm) ? summaryYm : months[0]?.ym;
  const idx = months.findIndex((m) => m.ym === ym);
  const list = useMemo(() => (ym ? byMonth.get(ym) ?? [] : []), [byMonth, ym]);
  const sum = useMemo(() => totals(list, excluded), [list, excluded]);
  const cats = useMemo(() => expenseByCategory(list, excluded), [list, excluded]);

  if (!ym) return null;
  const maxCat = cats[0]?.amount ?? 0;

  return (
    <Page title="集計">
      <div className="mx-4 mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={idx >= months.length - 1}
          onClick={() => setSummaryYm(months[idx + 1].ym)}
          className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm disabled:opacity-30"
          aria-label="前の月"
        >
          <ChevronLeft />
        </button>
        <select
          value={ym}
          onChange={(e) => setSummaryYm(e.target.value)}
          className="h-11 flex-1 rounded-xl bg-surface px-3 text-center font-bold shadow-sm"
          aria-label="月を選ぶ"
        >
          {months.map((m) => (
            <option key={m.ym} value={m.ym}>
              {formatYm(m.ym)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={idx <= 0}
          onClick={() => setSummaryYm(months[idx - 1].ym)}
          className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm disabled:opacity-30"
          aria-label="次の月"
        >
          <ChevronRight />
        </button>
      </div>

      <Card>
        <dl className="space-y-3">
          <div className="flex items-baseline justify-between">
            <dt className="text-sm text-muted">収入</dt>
            <dd className="tabular text-xl font-bold text-income">{formatYen(sum.income)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-sm text-muted">支出</dt>
            <dd className="tabular text-xl font-bold text-expense">{formatYen(sum.expense)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <dt className="text-sm font-bold">収支</dt>
            <dd className="text-2xl font-bold">
              <Amount value={sum.balance} />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          集計 {sum.count}件{sum.excludedCount > 0 && ` ／ 除外 ${sum.excludedCount}件（振替・計算対象外・除外ルール）`}
        </p>
        <button
          type="button"
          onClick={() => showTransactions(monthRange(ym))}
          className="mt-3 h-11 w-full rounded-xl bg-bg text-sm font-medium text-accent"
        >
          この月の明細を見る
        </button>
      </Card>

      <Card title="支出の内訳（大項目）">
        {cats.length === 0 ? (
          <p className="text-sm text-muted">この月の支出はありません。</p>
        ) : (
          <ul className="-mx-2">
            {cats.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => showTransactions({ ...monthRange(ym), large: [c.name], flow: 'expense' })}
                  className="w-full rounded-lg px-2 py-2 text-left active:bg-bg"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="tabular shrink-0">
                      {formatYen(c.amount)}
                      <span className="ml-2 inline-block w-12 text-right text-xs text-muted">
                        {sum.expense > 0 ? `${Math.round((c.amount / sum.expense) * 1000) / 10}%` : ''}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-expense/70" style={{ width: `${maxCat ? (c.amount / maxCat) * 100 : 0}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
