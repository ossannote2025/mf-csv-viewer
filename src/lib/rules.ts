import { normalizeForSearch } from './format';
import type { ExclusionMap, ExclusionRule, RuleConditions, Transaction } from './types';

export const BUILTIN_RULES: ExclusionRule[] = [
  {
    id: 'builtin-transfer',
    name: '振替（口座間の移動）',
    enabled: true,
    builtin: 'transfer',
    order: 0,
    cond: {},
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-nonTarget',
    name: '計算対象外',
    enabled: true,
    builtin: 'nonTarget',
    order: 1,
    cond: {},
    createdAt: 0,
    updatedAt: 0,
  },
];

/** 条件が1つも指定されていないか（空ルールは何にも当てはまらない扱い） */
export function isEmptyConditions(c: RuleConditions): boolean {
  return (
    !(c.content && c.content.value.trim() !== '') &&
    !(c.institutions && c.institutions.length) &&
    !(c.large && c.large.length) &&
    !(c.middle && c.middle.length) &&
    c.amountMin === undefined &&
    c.amountMax === undefined &&
    c.flow === undefined &&
    !c.dateFrom &&
    !c.dateTo
  );
}

/** 1つのルールに明細が当てはまるか（条件どうしはAND） */
export function matchesRule(rule: ExclusionRule, t: Transaction): boolean {
  if (rule.builtin === 'transfer') return t.isTransfer;
  if (rule.builtin === 'nonTarget') return !t.isTarget;

  const c = rule.cond;
  if (isEmptyConditions(c)) return false;

  if (c.content && c.content.value.trim() !== '') {
    const target = normalizeForSearch(t.content);
    const v = normalizeForSearch(c.content.value.trim());
    const ok =
      c.content.op === 'equals' ? target.trim() === v : c.content.op === 'startsWith' ? target.startsWith(v) : target.includes(v);
    if (!ok) return false;
  }
  if (c.institutions?.length && !c.institutions.includes(t.institution)) return false;
  if (c.large?.length && !c.large.includes(t.large)) return false;
  if (c.middle?.length && !c.middle.includes(t.middle)) return false;
  const abs = Math.abs(t.amount);
  if (c.amountMin !== undefined && abs < c.amountMin) return false;
  if (c.amountMax !== undefined && abs > c.amountMax) return false;
  if (c.flow === 'income' && !(t.amount > 0)) return false;
  if (c.flow === 'expense' && !(t.amount < 0)) return false;
  if (c.dateFrom && t.date < c.dateFrom) return false;
  if (c.dateTo && t.date > c.dateTo) return false;
  return true;
}

/** 有効なルールをすべて適用し、除外される明細のMapを作る（ルールどうしはOR） */
export function computeExclusions(transactions: Transaction[], rules: ExclusionRule[]): ExclusionMap {
  const active = rules.filter((r) => r.enabled).sort((a, b) => a.order - b.order);
  const map: ExclusionMap = new Map();
  if (active.length === 0) return map;
  for (const t of transactions) {
    let hits: string[] | undefined;
    for (const r of active) {
      if (matchesRule(r, t)) (hits ??= []).push(r.id);
    }
    if (hits) map.set(t.id, hits);
  }
  return map;
}

/** ルールのプレビュー：当てはまる件数と金額合計 */
export function previewRule(rule: ExclusionRule, transactions: Transaction[]): { count: number; income: number; expense: number } {
  let count = 0;
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (!matchesRule(rule, t)) continue;
    count++;
    if (t.amount > 0) income += t.amount;
    else expense += -t.amount;
  }
  return { count, income, expense };
}

/** DBに保存されたルールに組み込みルールが欠けていれば補う */
export function ensureBuiltinRules(rules: ExclusionRule[]): ExclusionRule[] {
  const out = [...rules];
  for (const b of BUILTIN_RULES) {
    if (!out.some((r) => r.builtin === b.builtin)) out.push({ ...b });
  }
  return out.sort((a, b) => a.order - b.order);
}
