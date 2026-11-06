import { describe, expect, it } from 'vitest';
import { exportFileName, toCsv } from './exportCsv';
import { parseMfCsv } from './csvParser';
import { decodeCsvBytes } from './encoding';
import type { Transaction } from './types';

const base: Transaction = {
  id: 'A1', date: '2025-08-01', ym: '2025-08', content: '架空スーパー, "本店"', amount: -1200, institution: '架空カード',
  large: '食費', middle: '食料品', memo: '=1+2', isTarget: true, isTransfer: false, sourceFile: 'a.csv', row: 2, importedAt: 1,
};

describe('toCsv', () => {
  const csv = toCsv([base, { ...base, id: 'B2', amount: 500, memo: '', isTransfer: true }], new Map([['B2', ['r1']]]), [
    { id: 'r1', name: '振替', enabled: true, order: 0, cond: {}, createdAt: 0, updatedAt: 0 },
  ]);

  it('UTF-8 BOM付き・CRLF・全項目を引用符で囲む', () => {
    expect(csv.startsWith('﻿"計算対象","日付"')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('"架空スーパー, ""本店"""');
  });

  it('数式として解釈される文字列を無害化し、金額はそのまま', () => {
    expect(csv).toContain(`"'=1+2"`);
    expect(csv).toContain('"-1200"');
  });

  it('除外ルール名を出力する', () => {
    expect(csv).toContain('"B2","振替"');
  });

  it('このアプリで再取り込みできる', () => {
    const bytes = new TextEncoder().encode(csv);
    const { text, encoding } = decodeCsvBytes(bytes);
    expect(encoding).toBe('utf-8-bom');
    const r = parseMfCsv(text, 'export.csv');
    expect(r.fileError).toBeUndefined();
    expect(r.transactions.map((t) => [t.id, t.amount, t.date, t.isTransfer])).toEqual([
      ['A1', -1200, '2025-08-01', false],
      ['B2', 500, '2025-08-01', true],
    ]);
    expect(r.transactions[0].content).toBe('架空スーパー, "本店"');
  });

  it('ファイル名', () => {
    expect(exportFileName('mf-export', new Date(2025, 10, 5, 9, 7))).toBe('mf-export-20251105-0907.csv');
  });
});
