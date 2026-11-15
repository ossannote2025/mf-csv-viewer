import { describe, expect, it } from 'vitest';
import { formatYen, formatYenAxis } from './format';

describe('formatYen', () => {
  it('3桁区切りで、マイナスは先頭に付ける', () => {
    expect(formatYen(12345)).toBe('¥12,345');
    expect(formatYen(-12345)).toBe('-¥12,345');
    expect(formatYen(0)).toBe('¥0');
    expect(formatYen(500, { sign: true })).toBe('+¥500');
  });
});

describe('formatYenAxis（グラフの軸の目盛り）', () => {
  it('1万円未満はそのまま、1万円以上は「万」', () => {
    expect(formatYenAxis(0)).toBe('¥0');
    expect(formatYenAxis(5000)).toBe('¥5,000');
    expect(formatYenAxis(12000)).toBe('¥1.2万');
    expect(formatYenAxis(300000)).toBe('¥30万');
    expect(formatYenAxis(-65000)).toBe('-¥6.5万');
  });
  it('1000万円以上は小数を付けず、1億円以上は「億」にして短く保つ', () => {
    expect(formatYenAxis(65000000)).toBe('¥6500万');
    expect(formatYenAxis(99990000)).toBe('¥9999万');
    expect(formatYenAxis(100000000)).toBe('¥1億');
    expect(formatYenAxis(130000000)).toBe('¥1.3億');
    expect(formatYenAxis(-130000000)).toBe('-¥1.3億');
    // 幅 56px の軸に収まる長さ（いちばん長い「-¥9999万」で7文字）
    for (const n of [-99990000, -130000000, -1234500000]) expect(formatYenAxis(n).length).toBeLessThanOrEqual(7);
  });
});
