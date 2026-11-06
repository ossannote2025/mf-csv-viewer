import { useMemo } from 'react';
import { groupByMonth, listMonths } from '../lib/aggregate';
import { useAppStore } from '../store/useAppStore';

/** 月の一覧・月ごとの明細・選択中の月（集計タブとグラフタブで共有） */
export function useMonthData() {
  const transactions = useAppStore((s) => s.transactions);
  const summaryYm = useAppStore((s) => s.summaryYm);
  const months = useMemo(() => listMonths(transactions), [transactions]);
  const byMonth = useMemo(() => groupByMonth(transactions), [transactions]);
  const ym = summaryYm && byMonth.has(summaryYm) ? summaryYm : months[0]?.ym;
  return { transactions, months, byMonth, ym };
}
