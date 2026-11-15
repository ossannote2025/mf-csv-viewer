import { describe, expect, it } from 'vitest';
import { parseMfCsv } from './csvParser';
import { toCsv } from './exportCsv';
import { importCsvBytes } from './importer';
import { countInSpans, findMissing, looksLikeDeletedInSource, spanOf } from './missing';
import type { Transaction } from './types';

// 架空の明細だけを使う
function tx(id: string, date: string, p: Partial<Transaction> = {}): Transaction {
  return {
    id, date, ym: date.slice(0, 7), content: '架空ストア', amount: -1000, institution: 'みどり架空カード', large: '食費', middle: '食料品',
    memo: '', isTarget: true, isTransfer: false, sourceFile: 'f', row: 2, importedAt: 0, ...p,
  };
}
const ids = (list: Transaction[]) => list.map((t) => t.id);
const HEADER = '計算対象,日付,内容,金額（円）,保有金融機関,大項目,中項目,メモ,振替,ID';
const row = (id: string, date: string) => `1,${date.replace(/-/g, '/')},架空ストア,-1000,みどり架空カード,食費,食料品,,0,${id}`;
const bytes = (lines: string[]) => new TextEncoder().encode([HEADER, ...lines].join('\n') + '\n');

describe('spanOf', () => {
  it('明細の最初の日付〜最後の日付を返す（並び順によらない）', () => {
    expect(spanOf([tx('a', '2025-10-12'), tx('b', '2025-10-03'), tx('c', '2025-10-28')])).toEqual({ from: '2025-10-03', to: '2025-10-28' });
    expect(spanOf([])).toBeUndefined();
  });
});

describe('findMissing（今回の CSV にない明細）', () => {
  const stored = [tx('a', '2025-10-03'), tx('b', '2025-10-12'), tx('gone', '2025-10-15'), tx('c', '2025-10-28'), tx('sep', '2025-09-30'), tx('nov', '2025-11-01')];

  it('CSV の期間内の日付で、CSV に ID がない明細を返す', () => {
    const found = findMissing(stored, [{ from: '2025-10-03', to: '2025-10-28' }], new Set(['a', 'b', 'c']));
    expect(ids(found)).toEqual(['gone']);
  });

  it('期間の外の明細は対象にしない（月の途中で書き出した古い CSV を取り込んでも、それ以降を「ない」としない）', () => {
    // 10/12 までの CSV。10/15・10/28 の明細は CSV にないが、期間の外なので出さない
    expect(findMissing(stored, [{ from: '2025-10-03', to: '2025-10-12' }], new Set(['a', 'b']))).toEqual([]);
  });

  it('期間の両端の日付は含む。年をまたぐ期間・うるう日も扱える', () => {
    const list = [tx('first', '2023-12-31'), tx('leap', '2024-02-29'), tx('last', '2024-03-01'), tx('out', '2024-03-02')];
    expect(ids(findMissing(list, [{ from: '2023-12-31', to: '2024-03-01' }], new Set()))).toEqual(['first', 'leap', 'last']);
  });

  it('複数のファイルはまとめて見る（別のファイルにある ID は「ない」としない）', () => {
    const spans = [{ from: '2025-10-01', to: '2025-10-31' }, { from: '2025-01-01', to: '2025-12-31' }];
    // 月ごとのファイルにはないが、年ごとのファイルにある
    expect(ids(findMissing(stored, spans, new Set(['a', 'b', 'c', 'gone', 'sep'])))).toEqual(['nov']);
  });

  it('期間がなければ何も返さない', () => {
    expect(findMissing(stored, [], new Set())).toEqual([]);
  });
});

describe('looksLikeDeletedInSource（最初からチェックを付けるか）', () => {
  it('数件で、期間内の明細の一部だけなら true', () => {
    expect(looksLikeDeletedInSource(1, 50)).toBe(true);
    expect(looksLikeDeletedInSource(20, 500)).toBe(true);
  });
  it('件数が多い・期間内の大半が当たるときは false（別のアカウントや一部だけの CSV の可能性）', () => {
    expect(looksLikeDeletedInSource(21, 500)).toBe(false);
    expect(looksLikeDeletedInSource(10, 20)).toBe(false);
    expect(looksLikeDeletedInSource(0, 20)).toBe(false);
  });
  it('countInSpans は期間内の明細を1回ずつ数える', () => {
    const list = [tx('a', '2025-10-03'), tx('b', '2025-10-12'), tx('c', '2025-11-01')];
    expect(countInSpans(list, [{ from: '2025-10-01', to: '2025-10-31' }, { from: '2025-10-10', to: '2025-10-20' }])).toBe(2);
  });
});

describe('取り込みの結果から期間を決める', () => {
  it('ファイルの明細の日付の範囲と、すべての行を読めたかを返す', () => {
    const { result } = importCsvBytes(bytes([row('a', '2025-10-03'), row('b', '2025-10-28')]), 'f.csv', new Map());
    expect(result.span).toEqual({ from: '2025-10-03', to: '2025-10-28' });
    expect(result.complete).toBe(true);
  });

  it('読み飛ばした行があるファイルは complete にしない（読めなかった行の明細を「ない」としないため）', () => {
    const { result } = importCsvBytes(bytes([row('a', '2025-10-03'), '1,2025/10/10,架空ストア,金額なし,みどり架空カード,食費,食料品,,0,b']), 'f.csv', new Map());
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
  });

  it('このアプリが書き出した CSV（絞り込んだ一部だけのことがある）は complete にしない', () => {
    const csv = toCsv([tx('a', '2025-10-03'), tx('c', '2025-10-28')], new Map(), []);
    expect(parseMfCsv(csv, 'export.csv').ownExport).toBe(true);
    const { result } = importCsvBytes(new TextEncoder().encode(csv), 'export.csv', new Map());
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    expect(parseMfCsv([HEADER, row('a', '2025-10-03')].join('\n'), 'mf.csv').ownExport).toBeUndefined();
  });

  it('マネーフォワードで1件消してから取り込み直すと、その1件だけが見つかる', () => {
    const existing = new Map<string, Transaction>();
    importCsvBytes(bytes([row('a', '2025-10-03'), row('gone', '2025-10-15'), row('c', '2025-10-28')]), 'oct.csv', existing);
    const second = importCsvBytes(bytes([row('a', '2025-10-03'), row('c', '2025-10-28')]), 'oct.csv', existing);
    const found = findMissing([...existing.values()], [second.result.span!], new Set(second.transactions.map((t) => t.id)));
    expect(ids(found)).toEqual(['gone']);
  });
});
