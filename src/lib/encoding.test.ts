import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { decodeCsvBytes } from './encoding';

const text = '"計算対象","日付","内容"\r\n"1","2025/8/1","ｺﾝﾋﾞﾆ ①テスト～"\r\n';

describe('decodeCsvBytes', () => {
  it('Shift_JIS（CP932）を判定して読める', () => {
    const bytes = iconv.encode(text, 'CP932');
    const r = decodeCsvBytes(new Uint8Array(bytes));
    expect(r.encoding).toBe('shift_jis');
    expect(r.text).toBe(text);
  });

  it('UTF-8（BOMあり）を判定してBOMを除く', () => {
    const bytes = new Uint8Array(Buffer.from('\uFEFF' + text, 'utf-8'));
    const r = decodeCsvBytes(bytes);
    expect(r.encoding).toBe('utf-8-bom');
    expect(r.text).toBe(text);
  });

  it('UTF-16（BOMあり。リトル／ビッグエンディアン）を判定して読める', () => {
    const le = new Uint8Array([0xff, 0xfe, ...Buffer.from(text, 'utf16le')]);
    expect(decodeCsvBytes(le)).toEqual({ text, encoding: 'utf-16' });
    const be = Buffer.from(text, 'utf16le');
    be.swap16();
    expect(decodeCsvBytes(new Uint8Array([0xfe, 0xff, ...be]))).toEqual({ text, encoding: 'utf-16' });
  });

  it('UTF-8（BOMなし）を判定する', () => {
    const r = decodeCsvBytes(new Uint8Array(Buffer.from(text, 'utf-8')).buffer);
    expect(r.encoding).toBe('utf-8');
    expect(r.text).toBe(text);
  });

  it('ASCIIのみのデータはUTF-8として扱う', () => {
    const r = decodeCsvBytes(new Uint8Array(Buffer.from('a,b\r\n1,2', 'utf-8')));
    expect(r.encoding).toBe('utf-8');
  });
});
