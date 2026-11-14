import { describe, expect, it } from 'vitest';
import { groupByMonth, totals } from './aggregate';
import { duplicateRule, findDuplicates } from './doubleCount';
import { buildMonthlyReport, formatRatio, isReportExpense } from './monthlyReport';
import { BUILTIN_RULES, computeExclusions } from './rules';
import type { ExclusionRule, Transaction } from './types';

// 架空の明細だけを使う
let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  const date = p.date ?? '2025-10-05';
  return {
    id: `t${n++}`, date, ym: date.slice(0, 7), content: '架空ストア', amount: -1000, institution: 'みどり架空カード', large: '食費', middle: '食料品',
    memo: '', isTarget: true, isTransfer: false, sourceFile: 'f', row: n, importedAt: 0, ...p,
  };
}

function rule(id: string, cond: ExclusionRule['cond']): ExclusionRule {
  return { id, name: id, enabled: true, order: 10, cond, createdAt: 0, updatedAt: 0 };
}

/** レポートに出てくる明細IDをすべて集める（明細一覧・トップ10） */
function idsInReport(r: ReturnType<typeof buildMonthlyReport>): Set<string> {
  return new Set([...r.rows, ...r.top].map((x) => x.id));
}

describe('月次の支出レポート：載せない明細', () => {
  const salary = tx({ id: 'salary', amount: 300000, content: '給与 架空商事', large: '収入', middle: '給与', institution: 'さくら架空銀行' });
  const refund = tx({ id: 'refund', amount: 500, content: '返金 架空ストア' });
  const transferOut = tx({ id: 'transferOut', amount: -50000, isTransfer: true, content: '振替 架空証券へ', institution: 'さくら架空銀行' });
  const transferIn = tx({ id: 'transferIn', amount: 50000, isTransfer: true, content: '振替 さくら架空銀行から', institution: '架空証券' });
  const nonTarget = tx({ id: 'nonTarget', amount: -7000, isTarget: false, content: '計算対象外の支出' });
  const ruled = tx({ id: 'ruled', amount: -12000, content: '家賃 架空不動産', large: '住宅', middle: '家賃' });
  const food = tx({ id: 'food', date: '2025-10-03', amount: -3000, content: '架空スーパー' });
  const cafe = tx({ id: 'cafe', date: '2025-10-01', amount: -800, content: '架空カフェ', middle: '外食' });
  const all = [salary, refund, transferOut, transferIn, nonTarget, ruled, food, cafe];
  const rules = [...BUILTIN_RULES, rule('rent', { content: { op: 'contains', value: '架空不動産' } })];

  it('収入・振替・計算対象外・除外ルールの明細は載せず、支出合計はアプリの集計と一致する', () => {
    const excluded = computeExclusions(all, rules);
    const r = buildMonthlyReport(groupByMonth(all), excluded, '2025-10', '2025-10');
    expect([...idsInReport(r)].sort()).toEqual(['cafe', 'food']);
    expect(r.total).toBe(3800);
    expect(r.count).toBe(2);
    expect(r.total).toBe(totals(all, excluded).expense);
    expect(r.appExpense).toBe(r.total);
    // カテゴリ別にも収入・除外分は入らない
    expect(r.categories).toEqual([{ name: '食費', amount: 3800, count: 2, ratio: 1 }]);
  });

  it('振替・計算対象外の組み込みルールを OFF にしていても載せない（アプリの集計とずれる分は appExpense でわかる）', () => {
    const off = rules.map((x) => (x.builtin ? { ...x, enabled: false } : x));
    const excluded = computeExclusions(all, off);
    const r = buildMonthlyReport(groupByMonth(all), excluded, '2025-10', '2025-10');
    expect([...idsInReport(r)].sort()).toEqual(['cafe', 'food']);
    expect(r.total).toBe(3800);
    expect(r.appExpense).toBe(3800 + 50000 + 7000);
  });

  it('レポートのデータに収入の金額は含まれない', () => {
    const excluded = computeExclusions(all, rules);
    const r = buildMonthlyReport(groupByMonth(all), excluded, '2025-10', '2025-10');
    const json = JSON.stringify(r);
    expect(json).not.toContain('300000');
    expect(json).not.toContain('給与');
    expect(json).not.toContain('返金');
    expect(Object.keys(r)).not.toContain('income');
    expect(Object.keys(r)).not.toContain('balance');
  });

  it('二重計上の候補で「除外する」とした明細は載せない', () => {
    const a = tx({ id: 'dupA', date: '2025-10-10', amount: -4980, content: '架空イヤホン', institution: 'AMAZON.CO.JP' });
    const b = tx({ id: 'dupB', date: '2025-10-11', amount: -4980, content: 'カクウツウハン', institution: 'みどり架空カード' });
    const list = [a, b, food];
    const pairs = findDuplicates(list, new Map(), new Set());
    expect(pairs).toHaveLength(1);
    const excluded = computeExclusions(list, [...BUILTIN_RULES, rule('dup', duplicateRule(pairs[0], 'b').cond)]);
    const r = buildMonthlyReport(groupByMonth(list), excluded, '2025-10', '2025-10');
    const ids = idsInReport(r);
    expect(ids.size).toBe(2);
    expect(ids.has('food')).toBe(true);
    expect(ids.has(pairs[0].b.id)).toBe(false);
    expect(r.total).toBe(3000 + 4980);
  });

  it('isReportExpense：支出で、振替・計算対象外・除外でないものだけ', () => {
    const ex = new Map([['ruled', ['rent']]]);
    expect(all.filter((t) => isReportExpense(t, ex)).map((t) => t.id)).toEqual(['food', 'cafe']);
  });
});

describe('月次の支出レポート：構成', () => {
  it('明細は日付の古い順、トップ10は金額の大きい順に最大10件', () => {
    const list = Array.from({ length: 12 }, (_, i) => tx({ id: `x${i}`, date: `2025-10-${String(12 - i).padStart(2, '0')}`, amount: -(i + 1) * 100 }));
    const r = buildMonthlyReport(groupByMonth(list), new Map(), '2025-10', '2025-10');
    expect(r.rows.map((x) => x.date)).toEqual([...r.rows.map((x) => x.date)].sort());
    expect(r.rows[0].date).toBe('2025-10-01');
    expect(r.top).toHaveLength(10);
    expect(r.top[0]).toMatchObject({ id: 'x11', amount: 1200 });
    expect(r.top[9].amount).toBe(300);
  });

  it('前月比・前年同月比は支出どうしで比べ、データの期間より前の月とは比べない', () => {
    const list = [
      tx({ date: '2024-10-05', amount: -2000 }),
      tx({ date: '2025-09-05', amount: -4000 }),
      tx({ date: '2025-09-25', amount: 200000, large: '収入' }),
      tx({ date: '2025-10-05', amount: -5000 }),
    ];
    const byMonth = groupByMonth(list);
    const r = buildMonthlyReport(byMonth, new Map(), '2025-10', '2024-10');
    expect(r.prevMonth).toEqual({ diff: 1000, ratio: 0.25 });
    expect(r.lastYear).toEqual({ diff: 3000, ratio: 1.5 });
    const r2 = buildMonthlyReport(byMonth, new Map(), '2025-10', '2025-09');
    expect(r2.lastYear).toBeNull();
  });

  it('支出がない月は合計0・一覧が空', () => {
    const r = buildMonthlyReport(groupByMonth([tx({ amount: 1000 })]), new Map(), '2025-10', '2025-10');
    expect(r).toMatchObject({ total: 0, count: 0, rows: [], top: [], categories: [] });
  });

  it('明細一覧にメモを持たせる（前後の空白は除く）', () => {
    const r = buildMonthlyReport(groupByMonth([tx({ id: 'm', memo: ' 架空の旅行用 ' }), tx({ id: 'n' })]), new Map(), '2025-10', '2025-10');
    expect(r.rows.map((x) => x.memo)).toEqual(['架空の旅行用', '']);
  });

  it('割合の表示', () => {
    expect(formatRatio(0.12345)).toBe('12.3%');
    expect(formatRatio(1)).toBe('100%');
  });
});
