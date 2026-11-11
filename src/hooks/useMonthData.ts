import { useMemo } from 'react';
import { groupByMonth, listMonths } from '../lib/aggregate';
import { useAppStore } from '../store/useAppStore';

/** 月の一覧・月ごとの明細・選択中の月（集計タブとグラフタブで共有） */
export function useMonthData() {
  const transactions = useAppStore((s) => s.transactions);
  const summaryYm = useAppStore((s) => s.summaryYm);
  const months = useMemo(() => listMonths(transactions), [transactions]);
  const byMonth = useMemo(() => groupByMonth(transactions), [transactions]);
  /** 月の値だけの一覧（新しい順。スワイプでの切り替えに使う） */
  const monthValues = useMemo(() => months.map((m) => m.ym), [months]);
  const ym = summaryYm && byMonth.has(summaryYm) ? summaryYm : months[0]?.ym;
  return { transactions, months, monthValues, byMonth, ym };
}
