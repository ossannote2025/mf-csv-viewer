import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importCsvBytes, mergeById, summarize } from './importer';
import type { Transaction } from './types';

const SAMPLE_DIR = join(__dirname, '../../sample');

function tx(id: string, amount = -100): Transaction {
  return {
    id, date: '2025-08-01', ym: '2025-08', content: 'x', amount, institution: 'X', large: '食費', middle: '外食',
    memo: '', isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 0,
  };
}

describe('mergeById', () => {
  it('新しいIDは追加、既存IDは上書きとして数える', () => {
    const m = new Map([['A', tx('A')]]);
    const r = mergeById(m, [tx('A', -999), tx('B')]);
    expect(r).toEqual({ added: 1, updated: 1 });
    expect(m.size).toBe(2);
    expect(m.get('A')!.amount).toBe(-999);
  });
  it('同じ取り込み内で重複したIDも二重計上しない', () => {
    const m = new Map<string, Transaction>();
    const r = mergeById(m, [tx('A'), tx('A', -5)]);
    expect(r).toEqual({ added: 1, updated: 1 });
    expect(m.size).toBe(1);
  });
});

describe('importCsvBytes（sample/ の架空データ）', () => {
  const files = readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.csv')).sort();

  it('3か月分・3種類の文字コードを読める', () => {
    expect(files).toHaveLength(3);
    const existing = new Map<string, Transaction>();
    const results = files.map((f) => importCsvBytes(readFileSync(join(SAMPLE_DIR, f)), f, existing).result);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.encoding).sort()).toEqual(['shift_jis', 'utf-8', 'utf-8-bom']);
    expect(results.map((r) => r.months)).toEqual([['2025-08'], ['2025-09'], ['2025-10']]);
    for (const r of results) {
      expect(r.rowCount).toBeGreaterThanOrEqual(45);
      expect(r.rowErrors).toEqual([]);
    }
    const s = summarize(results);
    expect(s.added).toBe(existing.size);
    expect(s.updated).toBe(0);
    // Shift_JIS のファイルが文字化けしていない
    const aug = [...existing.values()].filter((t) => t.ym === '2025-08');
    expect(aug.some((t) => t.content === '給与 カセウ商事')).toBe(true);
  });

  it('同じファイルを再取り込みすると全件上書き（重複）になる', () => {
    const existing = new Map<string, Transaction>();
    const bytes = readFileSync(join(SAMPLE_DIR, files[0]));
    const first = importCsvBytes(bytes, files[0], existing).result;
    const second = importCsvBytes(bytes, files[0], existing).result;
    expect(second.added).toBe(0);
    expect(second.updated).toBe(first.added);
    expect(existing.size).toBe(first.added);
  });

  it('形式が違うファイルは失敗として返し、他のファイルは取り込める', () => {
    const existing = new Map<string, Transaction>();
    const bad = importCsvBytes(new TextEncoder().encode('foo,bar\n1,2'), 'bad.csv', existing).result;
    const good = importCsvBytes(readFileSync(join(SAMPLE_DIR, files[1])), files[1], existing).result;
    const s = summarize([bad, good]);
    expect(s.failed.map((f) => f.fileName)).toEqual(['bad.csv']);
    expect(s.failed[0].error).toContain('見つかりません');
    expect(s.added).toBe(good.added);
  });
});
