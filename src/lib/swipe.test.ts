import { describe, expect, it } from 'vitest';
import { detectSwipe, periodAfterSwipe } from './swipe';

describe('detectSwipe', () => {
  const o = { x: 200, y: 300 };

  it('横に十分動けば左右を返す', () => {
    expect(detectSwipe(o, { x: 100, y: 310 })).toBe('left');
    expect(detectSwipe(o, { x: 300, y: 290 })).toBe('right');
  });

  it('横の移動が短ければスワイプではない', () => {
    expect(detectSwipe(o, { x: 150, y: 300 })).toBeNull();
  });

  it('縦の動きが大きい（スクロール）ときはスワイプではない', () => {
    expect(detectSwipe(o, { x: 100, y: 380 })).toBeNull();
    expect(detectSwipe(o, { x: 210, y: 100 })).toBeNull();
  });

  it('画面の端から始まったタッチは無視する', () => {
    const opts = { edge: 20, viewportWidth: 375 };
    expect(detectSwipe({ x: 10, y: 300 }, { x: 150, y: 300 }, opts)).toBeNull();
    expect(detectSwipe({ x: 365, y: 300 }, { x: 200, y: 300 }, opts)).toBeNull();
    expect(detectSwipe({ x: 30, y: 300 }, { x: 150, y: 300 }, opts)).toBe('right');
  });
});

describe('periodAfterSwipe', () => {
  // 新しい順
  const months = ['2026-03', '2026-02', '2026-01'];

  it('左へは次の月、右へは前の月', () => {
    expect(periodAfterSwipe(months, '2026-02', 'left')).toBe('2026-03');
    expect(periodAfterSwipe(months, '2026-02', 'right')).toBe('2026-01');
  });

  it('端の月ではそれ以上動かない', () => {
    expect(periodAfterSwipe(months, '2026-03', 'left')).toBeNull();
    expect(periodAfterSwipe(months, '2026-01', 'right')).toBeNull();
  });

  it('一覧にない月は null', () => {
    expect(periodAfterSwipe(months, '2025-12', 'left')).toBeNull();
  });

  it('年でも同じように動く', () => {
    const years = ['2026', '2025', '2024'];
    expect(periodAfterSwipe(years, '2025', 'left')).toBe('2026');
    expect(periodAfterSwipe(years, '2025', 'right')).toBe('2024');
    expect(periodAfterSwipe(years, '2024', 'right')).toBeNull();
  });
});
