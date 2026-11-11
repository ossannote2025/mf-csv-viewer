import { describe, expect, it } from 'vitest';
import { categoryColor, CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, mix, rankIndex, shadeColor } from './categoryColors';

describe('カテゴリ色', () => {
  it('カテゴリ名に固定で紐づく', () => {
    expect(categoryColor('食費')).toBe('#3E6A9E');
    expect(categoryColor('住宅')).toBe('#B9785A');
    expect(categoryColor('その他')).toBe('#A3A29C');
    expect(Object.keys(CATEGORY_COLORS)).toHaveLength(18);
  });
  it('定義にないカテゴリは「その他」と同じ色', () => {
    expect(categoryColor('未定義のカテゴリ')).toBe(DEFAULT_CATEGORY_COLOR);
    expect(DEFAULT_CATEGORY_COLOR).toBe(CATEGORY_COLORS['その他']);
  });
  it('水道・光熱費・税・社会保障・交際費・未分類にも色がある', () => {
    expect(categoryColor('水道・光熱費')).toBe('#DE8A2A');
    expect(categoryColor('税・社会保障')).toBe('#544C7A');
    expect(categoryColor('交際費')).toBe('#B35C9B');
    expect(categoryColor('未分類')).toBe('#6E6D68');
    expect(categoryColor('未分類')).not.toBe(categoryColor('その他'));
  });
  it('大項目の色はすべて別の色', () => {
    const colors = Object.values(CATEGORY_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
  it('ダークモードは白を18%混ぜる', () => {
    expect(categoryColor('食費', true)).toBe('#6185AF');
    expect(categoryColor('特別な支出', true)).toBe('#CDB178');
    expect(categoryColor('未定義', true)).toBe(mix('#A3A29C', 0.18));
  });
  it('mix は白・黒を混ぜる', () => {
    expect(mix('#000000', 0.5)).toBe('#808080');
    expect(mix('#FFFFFF', -1)).toBe('#000000');
    expect(mix('#3E6A9E', 0)).toBe('#3E6A9E');
  });
});

describe('中項目の色', () => {
  it('親の色を明るさ違いで使い、番号ごとに固定', () => {
    const parent = '#3E6A9E';
    expect(shadeColor(parent, 0)).toBe(parent);
    expect(shadeColor(parent, 1)).not.toBe(parent);
    expect(shadeColor(parent, 1)).toBe(shadeColor(parent, 9)); // 8段階で繰り返す
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => shadeColor(parent, i))).size).toBe(8);
  });
  it('全期間の金額順で番号を付ける', () => {
    const r = rankIndex([
      { name: '外食', amount: 100 },
      { name: '食料品', amount: 300 },
    ]);
    expect(r.get('食料品')).toBe(0);
    expect(r.get('外食')).toBe(1);
  });
});
