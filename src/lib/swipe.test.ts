import { describe, expect, it } from 'vitest';
import { detectSwipe, monthAfterSwipe } from './swipe';

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

describe('monthAfterSwipe', () => {
  // 新しい順
  const months = [{ ym: '2026-03' }, { ym: '2026-02' }, { ym: '2026-01' }];

  it('左へは次の月、右へは前の月', () => {
    expect(monthAfterSwipe(months, '2026-02', 'left')).toBe('2026-03');
    expect(monthAfterSwipe(months, '2026-02', 'right')).toBe('2026-01');
  });

  it('端の月ではそれ以上動かない', () => {
    expect(monthAfterSwipe(months, '2026-03', 'left')).toBeNull();
    expect(monthAfterSwipe(months, '2026-01', 'right')).toBeNull();
  });

  it('一覧にない月は null', () => {
    expect(monthAfterSwipe(months, '2025-12', 'left')).toBeNull();
  });
});
