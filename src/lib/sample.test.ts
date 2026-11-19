import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countSample, fetchSampleFiles, isSampleId, isSampleImport, SAMPLE_FILES, SAMPLE_PERIOD, sampleUrl } from './sample';
import { importCsvBytes } from './importer';
import { computeExclusions, BUILTIN_RULES } from './rules';
import { findRecurring } from './recurring';
import { findDoubleCounts } from './doubleCount';
import type { Transaction } from './types';

describe('サンプルの判定', () => {
  it('ID が SAMPLE＋数字で始まるものだけをサンプルとする', () => {
    expect(isSampleId('SAMPLE202610001')).toBe(true);
    expect(isSampleId('SAMPLEX')).toBe(false);
    expect(isSampleId('aBcSAMPLE1')).toBe(false);
    expect(isSampleId('sample2026')).toBe(false);
    expect(countSample([{ id: 'SAMPLE1' }, { id: 'xyz' }, { id: 'SAMPLE2' }])).toBe(2);
  });

  it('取り込み履歴はファイル名で判定する', () => {
    expect(isSampleImport({ fileName: 'mf-sample-2024.csv' })).toBe(true);
    expect(isSampleImport({ fileName: '収入・支出詳細_2024-01.csv' })).toBe(false);
  });

  it('URL はアプリの置き場所（base）の下になる', () => {
    expect(sampleUrl('a.csv', '/mf-csv-viewer/')).toBe('/mf-csv-viewer/sample/a.csv');
    expect(sampleUrl('a.csv', '/')).toBe('/sample/a.csv');
    expect(sampleUrl('a.csv', '/app')).toBe('/app/sample/a.csv');
  });

  it('読み込みに失敗したらエラーにする', async () => {
    const fail = (async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(fetchSampleFiles('/', fail)).rejects.toThrow('HTTP 404');
  });

  it('すべてのファイルを File として返す', async () => {
    const ok = (async () => new Response('x')) as typeof fetch;
    const files = await fetchSampleFiles('/', ok);
    expect(files.map((f) => f.name)).toEqual([...SAMPLE_FILES]);
  });
});

describe('サンプルの CSV（public/sample/）', () => {
  const byId = new Map<string, Transaction>();
  const results = SAMPLE_FILES.map((name) => {
    const r = importCsvBytes(readFileSync(`public/sample/${name}`), name, byId);
    for (const t of r.transactions) byId.set(t.id, t);
    return r.result;
  });
  const all = [...byId.values()];
  const excluded = computeExclusions(all, BUILTIN_RULES);

  it('3年分以上あり、すべての行を読み込める', () => {
    expect(SAMPLE_FILES.length).toBeGreaterThanOrEqual(3);
    for (const r of results) {
      expect(r.ok).toBe(true);
      expect(r.rowErrors).toEqual([]);
    }
    const months = new Set(all.map((t) => t.ym));
    expect([...months].sort()[0]).toBe(SAMPLE_PERIOD.from);
    expect([...months].sort().at(-1)).toBe(SAMPLE_PERIOD.to);
  });

  it('ID はすべてサンプルの印が付き、重複しない', () => {
    expect(all.every((t) => isSampleId(t.id))).toBe(true);
    expect(all.length).toBe(results.reduce((s, r) => s + r.rowCount, 0));
  });

  it('固定費の候補（毎月・年1回・止まったもの）が出る', () => {
    const { items } = findRecurring(all, excluded);
    expect(items.some((i) => i.kind === 'regular' && !i.stopped)).toBe(true);
    expect(items.some((i) => i.kind === 'yearly')).toBe(true);
    expect(items.some((i) => i.stopped)).toBe(true);
  });

  it('二重計上の候補（引き落とし・通販の組）が出る', () => {
    const r = findDoubleCounts(all, excluded, []);
    expect(r.withdrawals.length).toBeGreaterThan(0);
    expect(r.duplicates.length).toBeGreaterThan(0);
  });
});
