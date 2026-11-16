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

  it('取り込み直しても、記号で始まる内容・メモが変わらない', () => {
    const values = ['=1+2', '+81 架空商店', '-割引', '@架空ストア', "'=もとから引用符", "''-二重", "'ふつう", '架空スーパー'];
    const list = values.map((v, i) => ({ ...base, id: `T${i}`, content: v, memo: v, institution: v, large: v, middle: v }));
    const r = parseMfCsv(toCsv(list, new Map(), []).replace(/^\uFEFF/, ''), 'export.csv');
    expect(r.ownExport).toBe(true);
    for (const key of ['content', 'memo', 'institution', 'large', 'middle'] as const) {
      expect(r.transactions.map((t) => t[key])).toEqual(values);
    }
    // もう一度書き出しても同じ CSV になる
    expect(toCsv(r.transactions, new Map(), [])).toBe(toCsv(list, new Map(), []));
  });

  it("マネーフォワードの CSV（「除外ルール」列がない）では、先頭の ' を外さない", () => {
    const csv = ['"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"', `"1","2025/08/01","'=架空","-100","架空カード","食費","食料品","'-メモ","0","M1"`].join('\n');
    const r = parseMfCsv(csv, 'mf.csv');
    expect(r.transactions[0]).toMatchObject({ content: "'=架空", memo: "'-メモ" });
  });

  it('ファイル名', () => {
    expect(exportFileName('mf-export', new Date(2025, 10, 5, 9, 7))).toBe('mf-export-20251105-0907.csv');
  });
});
