export type DetectedEncoding = 'utf-8-bom' | 'utf-8' | 'shift_jis';

export interface DecodeResult {
  text: string;
  encoding: DetectedEncoding;
}

/**
 * CSVのバイト列を文字列に変換する。
 * 1. UTF-8のBOMがあればUTF-8
 * 2. UTF-8として正しく読めればUTF-8
 * 3. それ以外はShift_JIS（CP932）
 */
export function decodeCsvBytes(input: ArrayBuffer | Uint8Array): DecodeResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
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
  return e === 'shift_jis' ? 'Shift_JIS' : e === 'utf-8-bom' ? 'UTF-8（BOMあり）' : 'UTF-8';
}
