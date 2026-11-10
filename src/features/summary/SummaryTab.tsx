import { useMemo } from 'react';
import { Amount } from '../../components/Amount';
import { Segmented } from '../../components/Chips';
import { YearReport } from './YearReport';
import { ChangeText } from '../../components/ChangeText';
import { MonthPicker } from '../../components/MonthPicker';
import { Card, Page } from '../../components/Page';
import { expenseByCategory, totals } from '../../lib/aggregate';
import { shiftYm } from '../../lib/date';
import { monthRange } from '../../lib/filter';
import { formatYen } from '../../lib/format';
import { change } from '../../lib/series';
import { useMonthData } from '../../hooks/useMonthData';
import { useAppStore } from '../../store/useAppStore';

export function SummaryTab() {
  const mode = useAppStore((s) => s.summaryMode);
  const setMode = useAppStore((s) => s.setSummaryMode);
  return (
    <Page
      title="集計"
      sub={
        <Segmented
          value={mode}
          onChange={setMode}
          tone="onHeader"
          options={[
            { value: 'month', label: '月次' },
            { value: 'year', label: '年間レポート' },
          ]}
        />
      }
    >
      {mode === 'month' ? <MonthlyReport /> : <YearReport />}
    </Page>
  );
}

function MonthlyReport() {
  const { transactions, months, byMonth, ym } = useMonthData();
  const excluded = useAppStore((s) => s.excluded);
  const setSummaryYm = useAppStore((s) => s.setSummaryYm);
  const showTransactions = useAppStore((s) => s.showTransactions);
  const oldestYm = transactions[transactions.length - 1]?.ym ?? '';

  const calc = useMemo(() => {
    if (!ym) return null;
    const of = (m: string) => {
      // データの期間より前の月は比較しない（0円と比べない）
      if (m < oldestYm) return null;
      const list = byMonth.get(m) ?? [];
      const sum = totals(list, excluded);
      const cats = new Map(expenseByCategory(list, excluded).map((c) => [c.name, c.amount]));
      return { sum, cats };
    };
    return { cur: of(ym)!, prev: of(shiftYm(ym, -1)), lastYear: of(shiftYm(ym, -12)) };
  }, [ym, byMonth, excluded, oldestYm]);

  if (!ym || !calc) return null;
  const { cur, prev, lastYear } = calc;
  const sum = cur.sum;
  const cats = [...cur.cats.entries()].map(([name, amount]) => ({ name, amount }));
  const maxCat = cats[0]?.amount ?? 0;

  const compareRows: { label: string; key: 'income' | 'expense' | 'balance' }[] = [
    { label: '収入', key: 'income' },
    { label: '支出', key: 'expense' },
    { label: '収支', key: 'balance' },
  ];

  return (
    <>
      <div className="mx-4 mt-4">
        <MonthPicker months={months} value={ym} onChange={setSummaryYm} />
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
        <button type="button" onClick={() => showTransactions(monthRange(ym))} className="mt-3 h-11 w-full rounded-xl bg-bg text-sm font-medium text-accent">
          この月の明細を見る
        </button>
      </Card>

      <Card title="前月・前年同月との比較">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">前月比</th>
              <th className="py-1 text-right font-normal">前年同月比</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {compareRows.map((r) => (
              <tr key={r.key}>
                <th className="py-2 text-left font-normal">{r.label}</th>
                <td className="py-2 text-right text-xs">
                  <ChangeText c={change(sum[r.key], prev?.sum[r.key])} />
                </td>
                <td className="py-2 text-right text-xs">
                  <ChangeText c={change(sum[r.key], lastYear?.sum[r.key])} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">▲は増加、▼は減少。比較する月のデータがない場合は「—」です。</p>
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
                  <p className="mt-1 text-right text-[11px] text-muted">
                    前月比 <ChangeText c={change(c.amount, prev ? prev.cats.get(c.name) ?? 0 : undefined)} showRatio={false} />
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
