import { describe, expect, it } from 'vitest';
import { cleanConditions, describeConditions, draftRule, suggestName } from './ruleText';

describe('ルール条件の整形', () => {
  it('空の条件を取り除く', () => {
    expect(
      cleanConditions({ content: { op: 'contains', value: '  ' }, large: [], middle: ['外食'], amountMin: undefined, dateFrom: '' }),
    ).toEqual({ middle: ['外食'] });
    expect(cleanConditions({ content: { op: 'startsWith', value: ' カード ' } })).toEqual({ content: { op: 'startsWith', value: 'カード' } });
  });
  it('名前の候補と説明文', () => {
    expect(suggestName({ content: { op: 'contains', value: '引き落とし' } })).toBe('引き落とし');
    expect(suggestName({ large: ['食費', '住宅'] })).toBe('食費・住宅');
    expect(describeConditions({ content: { op: 'equals', value: 'A' }, institutions: ['銀行'], flow: 'expense', amountMin: 1000 })).toBe(
      '内容が「A」と一致、金融機関: 銀行、支出、¥1,000〜',
    );
  });
});

describe('draftRule', () => {
  it('既存ルールより後ろの順番で、ONの新規ルールを作る', () => {
    const r = draftRule([{ id: 'x', name: 'x', enabled: true, order: 20, cond: {}, createdAt: 0, updatedAt: 0 }], { large: ['食費'] }, '食費');
    expect(r).toMatchObject({ enabled: true, order: 21, cond: { large: ['食費'] }, name: '食費' });
    expect(r.id).toBeTruthy();
  });
});
