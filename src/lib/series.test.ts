import { describe, expect, it } from 'vitest';
import { byInstitution, categoryMonthMatrix, change, monthlySeries, presetRange, ymRange } from './series';
import type { ExclusionMap, Transaction } from './types';

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  const date = p.date ?? '2025-08-01';
  return {
    id: `t${n++}`, date, ym: date.slice(0, 7), content: '', amount: -100, institution: 'A', large: '食費', middle: '外食',
    memo: '', isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 0, ...p,
  };
}

describe('期間', () => {
  it('ymRange は年をまたぐ', () => {
    expect(ymRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
    expect(ymRange('2025-02', '2025-01')).toEqual([]);
  });
  it('プリセットはデータの最新月が基準、最古月より前にはしない', () => {
    expect(presetRange('12m', '2015-01', '2025-10')).toEqual({ from: '2024-11', to: '2025-10' });
    expect(presetRange('5y', '2015-01', '2025-10')).toEqual({ from: '2020-11', to: '2025-10' });
    expect(presetRange('all', '2015-01', '2025-10')).toEqual({ from: '2015-01', to: '2025-10' });
    expect(presetRange('24m', '2025-06', '2025-10')).toEqual({ from: '2025-06', to: '2025-10' });
    expect(ymRange('2015-01', '2025-12')).toHaveLength(132);
  });
});

describe('monthlySeries', () => {
  it('データのない月も0で埋め、除外分は含めない', () => {
    const ts = [
      tx({ date: '2025-01-05', amount: 1000 }),
      tx({ date: '2025-01-06', amount: -300 }),
      tx({ id: 'ex', date: '2025-01-07', amount: -9999 }),
      tx({ date: '2025-03-01', amount: -50 }),
      tx({ date: '2024-12-31', amount: -1 }),
    ];
    const ex: ExclusionMap = new Map([['ex', ['r']]]);
    expect(monthlySeries(ts, ex, ymRange('2025-01', '2025-03'))).toEqual([
      { ym: '2025-01', income: 1000, expense: 300, balance: 700 },
      { ym: '2025-02', income: 0, expense: 0, balance: 0 },
      { ym: '2025-03', income: 0, expense: 50, balance: -50 },
    ]);
  });
});

describe('categoryMonthMatrix', () => {
  const ts = [
    tx({ date: '2025-01-01', amount: -100, large: '食費', middle: '外食' }),
    tx({ date: '2025-01-02', amount: -200, large: '食費', middle: '食料品' }),
    tx({ date: '2025-02-02', amount: -50, large: '住宅', middle: '家賃' }),
    tx({ date: '2025-02-03', amount: 500, large: '収入', middle: '給与' }),
  ];
  const months = ['2025-01', '2025-02'];
  it('大項目×月の支出', () => {
    const m = categoryMonthMatrix(ts, new Map(), months);
    expect(m.get('食費')).toEqual([300, 0]);
    expect(m.get('住宅')).toEqual([0, 50]);
    expect(m.has('収入')).toBe(false);
  });
  it('中項目（大項目で絞る）', () => {
    const m = categoryMonthMatrix(ts, new Map(), months, 'middle', '食費');
    expect([...m.keys()].sort()).toEqual(['外食', '食料品']);
  });
});

describe('change / byInstitution', () => {
  it('増減と変化率', () => {
    expect(change(150, 100)).toEqual({ diff: 50, ratio: 0.5 });
    expect(change(100, 0)).toEqual({ diff: 100, ratio: null });
    expect(change(100, undefined)).toBeNull();
  });
  it('金融機関別（支出の多い順）', () => {
    const ts = [tx({ institution: '銀行', amount: 1000 }), tx({ institution: 'カード', amount: -500 }), tx({ institution: 'カード', amount: -300 })];
    expect(byInstitution(ts, new Map())).toEqual([
      { name: 'カード', income: 0, expense: 800, count: 2 },
      { name: '銀行', income: 1000, expense: 0, count: 1 },
    ]);
  });
});
