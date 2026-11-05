import { formatYen } from './format';
import type { ExclusionRule, RuleConditions } from './types';

/** 空の条件を取り除く */
export function cleanConditions(c: RuleConditions): RuleConditions {
  const out: RuleConditions = {};
  if (c.content && c.content.value.trim() !== '') out.content = { op: c.content.op, value: c.content.value.trim() };
  if (c.institutions?.length) out.institutions = c.institutions;
  if (c.large?.length) out.large = c.large;
  if (c.middle?.length) out.middle = c.middle;
  if (c.amountMin !== undefined) out.amountMin = c.amountMin;
  if (c.amountMax !== undefined) out.amountMax = c.amountMax;
  if (c.flow) out.flow = c.flow;
  if (c.dateFrom) out.dateFrom = c.dateFrom;
  if (c.dateTo) out.dateTo = c.dateTo;
  return out;
}

/** 条件からルール名の候補を作る */
export function suggestName(c: RuleConditions): string {
  if (c.content) return c.content.value;
  if (c.middle?.length) return c.middle.join('・');
  if (c.large?.length) return c.large.join('・');
  if (c.institutions?.length) return c.institutions.join('・');
  return '';
}

/** ルールの条件を短い文章にする（一覧表示用） */
export function describeConditions(c: RuleConditions): string {
  const parts: string[] = [];
  if (c.content) {
    const op = c.content.op === 'equals' ? 'と一致' : c.content.op === 'startsWith' ? 'で始まる' : 'を含む';
    parts.push(`内容が「${c.content.value}」${op}`);
  }
  if (c.institutions?.length) parts.push(`金融機関: ${c.institutions.join('・')}`);
  if (c.large?.length) parts.push(`大項目: ${c.large.join('・')}`);
  if (c.middle?.length) parts.push(`中項目: ${c.middle.join('・')}`);
  if (c.flow) parts.push(c.flow === 'income' ? '収入' : '支出');
  if (c.amountMin !== undefined || c.amountMax !== undefined) {
    parts.push(`${c.amountMin !== undefined ? formatYen(c.amountMin) : ''}〜${c.amountMax !== undefined ? formatYen(c.amountMax) : ''}`);
  }
  if (c.dateFrom || c.dateTo) parts.push(`期間: ${c.dateFrom ?? ''}〜${c.dateTo ?? ''}`);
  return parts.join('、');
}


function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** 新しいルールのひな形（明細からルールを作るときは cond を渡す） */
export function draftRule(rules: ExclusionRule[], cond: RuleConditions = {}, name = ''): ExclusionRule {
  const now = Date.now();
  return {
    id: newId(),
    name,
    enabled: true,
    order: Math.max(10, ...rules.map((r) => r.order + 1)),
    cond,
    createdAt: now,
    updatedAt: now,
  };
}

