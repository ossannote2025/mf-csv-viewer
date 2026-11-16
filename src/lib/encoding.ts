export type DetectedEncoding = 'utf-8-bom' | 'utf-8' | 'utf-16' | 'shift_jis';

export interface DecodeResult {
  text: string;
  encoding: DetectedEncoding;
}

/**
 * CSVのバイト列を文字列に変換する。
 * 1. UTF-8のBOMがあればUTF-8
 * 2. UTF-16のBOM（FF FE / FE FF）があればUTF-16（Excel の「Unicode テキスト」など。B11）
 * 3. UTF-8として正しく読めればUTF-8
 * 4. それ以外はShift_JIS（CP932）
 */
export function decodeCsvBytes(input: ArrayBuffer | Uint8Array): DecodeResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
  }
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    const label = bytes[0] === 0xff ? 'utf-16le' : 'utf-16be';
    return { text: new TextDecoder(label).decode(bytes.subarray(2)), encoding: 'utf-16' };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    // UTF-8として不正 → Shift_JIS とみなす
  }
  return { text: new TextDecoder('shift_jis').decode(bytes), encoding: 'shift_jis' };
}

export function encodingLabel(e: DetectedEncoding): string {
  return e === 'shift_jis' ? 'Shift_JIS' : e === 'utf-8-bom' ? 'UTF-8（BOMあり）' : e === 'utf-16' ? 'UTF-16' : 'UTF-8';
}
