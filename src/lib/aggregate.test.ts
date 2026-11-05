import { describe, expect, it } from 'vitest';
import { dateRange, expenseByCategory, listMonths, sortByDateDesc, totals, uniqueValues } from './aggregate';
import { applyFilter, EMPTY_FILTER, monthRange } from './filter';
import { formatYen } from './format';
import { shiftYm } from './date';
import type { ExclusionMap, Transaction } from './types';

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  const date = p.date ?? '2025-08-01';
  return {
    id: `t${n++}`, date, ym: date.slice(0, 7), content: '', amount: -100, institution: 'A', large: '食費', middle: '外食',
    memo: '', isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 0, ...p,
  };
}

describe('totals', () => {
  it('収入・支出・収支を集計し、除外分は含めない', () => {
    const ts = [tx({ amount: 1000 }), tx({ amount: -300 }), tx({ amount: -200 }), tx({ id: 'ex', amount: -5000 })];
    const ex: ExclusionMap = new Map([['ex', ['r']]]);
    expect(totals(ts, ex)).toEqual({ income: 1000, expense: 500, balance: 500, count: 3, excludedCount: 1 });
  });
});

describe('月・カテゴリ集計', () => {
  const ts = [
    tx({ date: '2016-01-05', amount: -100 }),
    tx({ date: '2025-12-31', amount: -300, large: '住宅' }),
    tx({ date: '2025-12-01', amount: -100 }),
    tx({ date: '2025-12-02', amount: 500, large: '収入' }),
  ];
  it('年をまたいで複数年の月一覧を新しい順で返す', () => {
    expect(listMonths(ts)).toEqual([{ ym: '2025-12', count: 3 }, { ym: '2016-01', count: 1 }]);
  });
  it('支出の大項目別合計（多い順、収入は含めない）', () => {
    expect(expenseByCategory(ts, new Map())).toEqual([
      { name: '住宅', amount: 300, count: 1 },
      { name: '食費', amount: 200, count: 2 },
    ]);
  });
  it('期間', () => {
    expect(dateRange(ts)).toEqual({ from: '2016-01-05', to: '2025-12-31' });
    expect(dateRange([])).toBeNull();
  });
  it('日付の降順・同じ日はCSVの順', () => {
    const a = tx({ date: '2025-01-01', row: 3 });
    const b = tx({ date: '2025-01-01', row: 2 });
    const c = tx({ date: '2025-02-01', row: 9 });
    expect(sortByDateDesc([a, b, c]).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });
  it('選択肢の一覧', () => {
    expect(uniqueValues(ts, 'large')).toEqual(['住宅', '収入', '食費'].sort((x, y) => x.localeCompare(y, 'ja')));
  });
});

describe('applyFilter', () => {
  const ts = [
    tx({ content: 'まるまるスーパー', memo: '', amount: -1200, date: '2025-08-03', institution: 'カード' }),
    tx({ content: 'ｶﾌｪ ミモザ', memo: '友人とランチ', amount: -800, date: '2025-09-10' }),
    tx({ content: '給与', amount: 285000, large: '収入', middle: '給与', date: '2025-08-25' }),
    tx({ id: 'ex', content: '振替', amount: -30000, date: '2025-08-26' }),
  ];
  const ex: ExclusionMap = new Map([['ex', ['builtin-transfer']]]);
  const run = (f: Partial<typeof EMPTY_FILTER>) => applyFilter(ts, { ...EMPTY_FILTER, ...f }, ex).map((t) => t.content);

  it('キーワードは内容・メモを対象に、空白区切りAND、全角半角を区別しない', () => {
    expect(run({ keyword: 'カフェ' })).toEqual(['ｶﾌｪ ミモザ']);
    expect(run({ keyword: 'ランチ' })).toEqual(['ｶﾌｪ ミモザ']);
    expect(run({ keyword: 'カフェ 友人' })).toEqual(['ｶﾌｪ ミモザ']);
    expect(run({ keyword: 'カフェ スーパー' })).toEqual([]);
  });
  it('期間・収支・金額範囲・カテゴリ・金融機関', () => {
    expect(run(monthRange('2025-08'))).toEqual(['まるまるスーパー', '給与', '振替']);
    expect(run({ flow: 'income' })).toEqual(['給与']);
    expect(run({ amountMin: 1000, amountMax: 2000 })).toEqual(['まるまるスーパー']);
    expect(run({ large: ['収入'] })).toEqual(['給与']);
    expect(run({ institutions: ['カード'] })).toEqual(['まるまるスーパー']);
  });
  it('除外を非表示にできる', () => {
    expect(run({ showExcluded: false })).not.toContain('振替');
  });
});

describe('format / date helpers', () => {
  it('formatYen', () => {
    expect(formatYen(12345)).toBe('¥12,345');
    expect(formatYen(-12345)).toBe('-¥12,345');
    expect(formatYen(0)).toBe('¥0');
    expect(formatYen(5, { sign: true })).toBe('+¥5');
  });
  it('shiftYm は年をまたぐ', () => {
    expect(shiftYm('2025-01', -1)).toBe('2024-12');
    expect(shiftYm('2025-12', 1)).toBe('2026-01');
    expect(shiftYm('2025-06', -120)).toBe('2015-06');
  });
  it('monthRange はうるう年に対応', () => {
    expect(monthRange('2024-02')).toEqual({ dateFrom: '2024-02-01', dateTo: '2024-02-29' });
  });
});
