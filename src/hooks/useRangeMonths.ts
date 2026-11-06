import { useMemo } from 'react';
import { presetRange, ymRange, type RangePreset } from '../lib/series';
import { useAppStore } from '../store/useAppStore';

/** 選択中の期間の年月一覧（古い順）。データの最古月〜最新月の範囲に収める */
export function useRangeMonths(preset?: RangePreset): string[] {
  const transactions = useAppStore((s) => s.transactions);
  const chartRange = useAppStore((s) => s.chartRange);
  const p = preset ?? chartRange;
  return useMemo(() => {
    if (transactions.length === 0) return [];
    const latest = transactions[0].ym;
    const oldest = transactions[transactions.length - 1].ym;
    const { from, to } = presetRange(p, oldest, latest);
    return ymRange(from, to);
  }, [transactions, p]);
}

