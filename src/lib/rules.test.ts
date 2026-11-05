import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, computeExclusions, ensureBuiltinRules, matchesRule, previewRule } from './rules';
import type { ExclusionRule, RuleConditions, Transaction } from './types';

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 'x', date: '2025-08-01', ym: '2025-08', content: '', amount: -100, institution: 'さくら架空銀行', large: '食費',
    middle: '外食', memo: '', isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 0, ...p,
  };
}
function rule(cond: RuleConditions, p: Partial<ExclusionRule> = {}): ExclusionRule {
  return { id: 'r', name: 'r', enabled: true, order: 10, cond, createdAt: 0, updatedAt: 0, ...p };
}

describe('matchesRule', () => {
  it('組み込みルール：振替・計算対象外', () => {
    const [transfer, nonTarget] = BUILTIN_RULES;
    expect(matchesRule(transfer, tx({ isTransfer: true }))).toBe(true);
    expect(matchesRule(transfer, tx({}))).toBe(false);
    expect(matchesRule(nonTarget, tx({ isTarget: false }))).toBe(true);
    expect(matchesRule(nonTarget, tx({}))).toBe(false);
  });

  it('内容：含む・完全一致・で始まる（全角半角を区別しない）', () => {
    const t = tx({ content: 'カード引き落とし ﾐﾄﾞﾘｶｰﾄﾞ' });
    expect(matchesRule(rule({ content: { op: 'contains', value: 'ミドリカード' } }), t)).toBe(true);
    expect(matchesRule(rule({ content: { op: 'startsWith', value: 'カード引き落とし' } }), t)).toBe(true);
    expect(matchesRule(rule({ content: { op: 'startsWith', value: 'ミドリ' } }), t)).toBe(false);
    expect(matchesRule(rule({ content: { op: 'equals', value: 'カード引き落とし' } }), t)).toBe(false);
    expect(matchesRule(rule({ content: { op: 'equals', value: 'カード引き落とし ミドリカード' } }), t)).toBe(true);
  });

  it('複数条件はAND', () => {
    const r = rule({ content: { op: 'contains', value: '引き落とし' }, institutions: ['さくら架空銀行'], flow: 'expense' });
    expect(matchesRule(r, tx({ content: 'カード引き落とし' }))).toBe(true);
    expect(matchesRule(r, tx({ content: 'カード引き落とし', institution: '別銀行' }))).toBe(false);
    expect(matchesRule(r, tx({ content: 'カード引き落とし', amount: 100 }))).toBe(false);
  });

  it('金額範囲（絶対値）・大項目・中項目・期間', () => {
    expect(matchesRule(rule({ amountMin: 100, amountMax: 200 }), tx({ amount: -150 }))).toBe(true);
    expect(matchesRule(rule({ amountMin: 100, amountMax: 200 }), tx({ amount: -250 }))).toBe(false);
    expect(matchesRule(rule({ large: ['食費'], middle: ['外食'] }), tx({}))).toBe(true);
    expect(matchesRule(rule({ large: ['住宅'] }), tx({}))).toBe(false);
    expect(matchesRule(rule({ dateFrom: '2025-08-01', dateTo: '2025-08-31' }), tx({}))).toBe(true);
    expect(matchesRule(rule({ dateFrom: '2025-09-01' }), tx({}))).toBe(false);
    expect(matchesRule(rule({ flow: 'income' }), tx({ amount: 1 }))).toBe(true);
  });

  it('条件が空のルールは何にも当てはまらない', () => {
    expect(matchesRule(rule({}), tx({}))).toBe(false);
    expect(matchesRule(rule({ content: { op: 'contains', value: '  ' } }), tx({}))).toBe(false);
  });
});

describe('computeExclusions', () => {
  it('ルールどうしはOR、OFFのルールは無視、当てはまったルールを全部記録', () => {
    const ts = [tx({ id: 'a', isTransfer: true }), tx({ id: 'b', isTarget: false, large: '住宅' }), tx({ id: 'c' })];
    const custom = rule({ large: ['住宅'] }, { id: 'housing' });
    const off = rule({ large: ['食費'] }, { id: 'off', enabled: false });
    const map = computeExclusions(ts, [...BUILTIN_RULES, custom, off]);
    expect(map.get('a')).toEqual(['builtin-transfer']);
    expect(map.get('b')).toEqual(['builtin-nonTarget', 'housing']);
    expect(map.has('c')).toBe(false);
  });

  it('組み込みルールもOFFにできる', () => {
    const ts = [tx({ id: 'a', isTransfer: true })];
    const rules = BUILTIN_RULES.map((r) => ({ ...r, enabled: false }));
    expect(computeExclusions(ts, rules).size).toBe(0);
  });
});

describe('previewRule / ensureBuiltinRules', () => {
  it('件数と金額を返す', () => {
    const ts = [tx({ amount: -100 }), tx({ amount: 300 }), tx({ amount: -50, large: '住宅' })];
    expect(previewRule(rule({ large: ['食費'] }), ts)).toEqual({ count: 2, income: 300, expense: 100 });
  });
  it('欠けている組み込みルールを補う', () => {
    expect(ensureBuiltinRules([]).map((r) => r.builtin)).toEqual(['transfer', 'nonTarget']);
    const existing = [{ ...BUILTIN_RULES[0], enabled: false }];
    const out = ensureBuiltinRules(existing);
    expect(out).toHaveLength(2);
    expect(out[0].enabled).toBe(false);
  });
});
