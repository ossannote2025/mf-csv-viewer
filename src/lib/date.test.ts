import { describe, expect, it } from 'vitest';
import { formatDateFull, formatDay } from './date';

describe('formatDay', () => {
  it('年・月・日と曜日を表示する（ゼロ埋めなし）', () => {
    expect(formatDay('2025-03-23')).toBe('2025/3/23（日）');
    expect(formatDay('2012-12-29')).toBe('2012/12/29（土）');
  });
  it('うるう日や年末年始も正しい曜日になる', () => {
    expect(formatDay('2024-02-29')).toBe('2024/2/29（木）');
    expect(formatDay('2025-01-01')).toBe('2025/1/1（水）');
  });
});

describe('formatDateFull', () => {
  it('YYYY/M/D 形式', () => {
    expect(formatDateFull('2025-08-03')).toBe('2025/8/3');
  });
});
