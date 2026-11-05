import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseAmount, parseMfCsv } from './csvParser';
import { normalizeDate } from './date';

const HEADER = '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"';

describe('normalizeDate', () => {
  it('ゼロ埋めあり・なし・ハイフン区切りに対応', () => {
    expect(normalizeDate('2025/8/3')).toBe('2025-08-03');
    expect(normalizeDate('2025/08/03')).toBe('2025-08-03');
    expect(normalizeDate('2025-08-03')).toBe('2025-08-03');
  });
  it('存在しない日付は null', () => {
    expect(normalizeDate('2025/2/30')).toBeNull();
    expect(normalizeDate('2024/2/29')).toBe('2024-02-29');
    expect(normalizeDate('2025/13/1')).toBeNull();
    expect(normalizeDate('8/3')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('カンマ・記号・全角に対応', () => {
    expect(parseAmount('-1,234')).toBe(-1234);
    expect(parseAmount('¥1,234')).toBe(1234);
    expect(parseAmount('－１２３')).toBe(-123);
    expect(parseAmount('500')).toBe(500);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('normalizeHeader', () => {
  it('全角カッコ・引用符・空白を吸収する', () => {
    expect(normalizeHeader('金額（円）')).toBe(normalizeHeader('金額(円)'));
    expect(normalizeHeader(' "ID" ')).toBe('ID');
    expect(normalizeHeader('\uFEFF計算対象')).toBe('計算対象');
  });
});

describe('parseMfCsv', () => {
  it('標準的なCSVを読める', () => {
    const csv = [
      HEADER,
      '"1","2025/08/31","まるまるスーパー","-1,980","みどり架空カード","食費","食料品","","0","ID001"',
      '"1","2025/8/25","給与 カセウ商事","285000","さくら架空銀行","収入","給与","8月分","0","ID002"',
      '"0","2025/8/20","立替","-500","みどり架空カード","","","","0","ID003"',
      '"1","2025/8/10","口座振替","-30000","さくら架空銀行","未分類","未分類","","1","ID004"',
    ].join('\r\n');
    const r = parseMfCsv(csv, 'a.csv', 1);
    expect(r.fileError).toBeUndefined();
    expect(r.rowErrors).toEqual([]);
    expect(r.transactions).toHaveLength(4);
    expect(r.transactions[0]).toMatchObject({
      id: 'ID001',
      date: '2025-08-31',
      ym: '2025-08',
      content: 'まるまるスーパー',
      amount: -1980,
      institution: 'みどり架空カード',
      large: '食費',
      middle: '食料品',
      isTarget: true,
      isTransfer: false,
      sourceFile: 'a.csv',
      row: 2,
    });
    expect(r.transactions[1].memo).toBe('8月分');
    expect(r.transactions[2]).toMatchObject({ isTarget: false, large: '未分類', middle: '未分類' });
    expect(r.transactions[3].isTransfer).toBe(true);
  });

  it('タブ区切り・ゼロ埋めなしの日付・引用符なしも読める', () => {
    const csv = [
      '計算対象\t日付\t内容\t金額（円）\t保有金融機関\t大項目\t中項目\tメモ\t振替\tID',
      '1\t2018/2/28\t架空食堂\t-397\t架空Edy\t食費\t外食\t\t0\tAbC-123_x',
    ].join('\n');
    const r = parseMfCsv(csv, 'tab.csv');
    expect(r.fileError).toBeUndefined();
    expect(r.transactions[0]).toMatchObject({ id: 'AbC-123_x', date: '2018-02-28', amount: -397 });
  });

  it('列の順番が違ってもヘッダー名で特定する', () => {
    const csv = ['ID,金額(円),日付,内容', 'X1,-100,2025/1/2,テスト'].join('\n');
    const r = parseMfCsv(csv, 'b.csv');
    expect(r.transactions[0]).toMatchObject({ id: 'X1', amount: -100, date: '2025-01-02', isTarget: true, isTransfer: false });
  });

  it('必須列がなければファイルエラーにする', () => {
    const r = parseMfCsv('名前,値段\nりんご,100', 'other.csv');
    expect(r.fileError).toMatch('「日付」');
    expect(r.fileError).toMatch('「金額（円）」');
    expect(r.transactions).toHaveLength(0);
  });

  it('空ファイルはファイルエラー', () => {
    expect(parseMfCsv('', 'empty.csv').fileError).toBe('ファイルが空です。');
  });

  it('不正な行は行番号付きで読み飛ばし、他の行は取り込む', () => {
    const csv = [
      HEADER,
      '"1","2025/8/1","OK","-100","X","食費","外食","","0","A"',
      '"1","2025/8/xx","NG日付","-100","X","食費","外食","","0","B"',
      '"1","2025/8/2","NG金額","abc","X","食費","外食","","0","C"',
      '"1","2025/8/3","IDなし","-100","X","食費","外食","","0",""',
    ].join('\n');
    const r = parseMfCsv(csv, 'c.csv');
    expect(r.fileError).toBeUndefined();
    expect(r.transactions.map((t) => t.id)).toEqual(['A']);
    expect(r.rowErrors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(r.rowErrors[0].message).toContain('日付');
  });

  it('全行が不正ならファイルエラー', () => {
    const csv = [HEADER, '"1","bad","x","-1","X","a","b","","0","A"'].join('\n');
    expect(parseMfCsv(csv, 'd.csv').fileError).toContain('2行目');
  });

  it('内容にカンマ・改行・引用符を含んでも読める', () => {
    const csv = [HEADER, '"1","2025/8/1","店, ""本店""","-100","X","食費","外食","複数\n行","0","A"'].join('\n');
    const t = parseMfCsv(csv, 'e.csv').transactions[0];
    expect(t.content).toBe('店, "本店"');
    expect(t.memo).toBe('複数\n行');
  });
});
