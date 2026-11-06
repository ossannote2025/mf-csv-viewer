import { describe, expect, it } from 'vitest';
import { monthsWithData, transactionsOfYear, transactionsOfYearMonths, yearlyTotals } from './yearly';
import type { ExclusionMap, Transaction } from './types';

let n = 0;
function tx(date: string, amount: number, id = `t${n++}`): Transaction {
  return {
    id, date, ym: date.slice(0, 7), content: '', amount, institution: 'A', large: '食費', middle: '外食', memo: '',
    isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 0,
  };
}

describe('yearlyTotals', () => {
  it('年ごとに集計し、データのある月数を数える（除外分は金額に含めない）', () => {
    const ts = [tx('2024-12-01', -100), tx('2025-01-01', 1000), tx('2025-01-20', -300), tx('2025-03-01', -200), tx('2025-03-02', -999, 'ex')];
    const ex: ExclusionMap = new Map([['ex', ['r']]]);
    expect(yearlyTotals(ts, ex)).toEqual([
      { year: '2025', income: 1000, expense: 500, balance: 500, months: 2 },
      { year: '2024', income: 0, expense: 100, balance: -100, months: 1 },
    ]);
    expect(transactionsOfYear(ts, '2024')).toHaveLength(1);
  });
});

describe('前年同期の抽出', () => {
  it('データのある月だけで前年と比べる', () => {
    const ts = [tx('2025-01-05', -100), tx('2025-02-05', -100), tx('2024-01-05', -50), tx('2024-02-05', -50), tx('2024-12-05', -999)];
    const months = monthsWithData(ts, '2025');
    expect([...months].sort()).toEqual(['01', '02']);
    expect(transactionsOfYearMonths(ts, '2024', months).map((t) => t.amount)).toEqual([-50, -50]);
  });
});
