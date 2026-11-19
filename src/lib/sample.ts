/**
 * 初めて使う人が試すためのサンプル（架空の家計。ファイルは public/sample/。scripts/generate-demo.ts で生成）。
 * サンプルの明細の ID は「SAMPLE＋数字」、ファイル名は「mf-sample-」で始まる。
 */
import type { ImportRecord, Transaction } from './types';
import { SAMPLE_FILES } from './sampleFiles';

export { SAMPLE_FILES, SAMPLE_PERIOD } from './sampleFiles';

/** サンプルの明細か（マネーフォワードの ID は英数字の乱数なので「SAMPLE＋数字」では始まらない） */
export function isSampleId(id: string): boolean {
  return /^SAMPLE\d/.test(id);
}

/** サンプルの CSV の取り込み履歴か */
export function isSampleImport(record: Pick<ImportRecord, 'fileName'>): boolean {
  return /^mf-sample-/.test(record.fileName);
}

export function countSample(transactions: readonly Pick<Transaction, 'id'>[]): number {
  let n = 0;
  for (const t of transactions) if (isSampleId(t.id)) n++;
  return n;
}

/** サンプルのファイルの URL（GitHub Pages の /mf-csv-viewer/ の下でも同じように使える） */
export function sampleUrl(name: string, base: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}sample/${name}`;
}

/** サンプルの CSV をすべて File として読み込む（同じサイトの中だけ。CSP の connect-src 'self' のまま） */
export async function fetchSampleFiles(base: string, fetcher: typeof fetch = fetch): Promise<File[]> {
  return Promise.all(
    SAMPLE_FILES.map(async (name) => {
      const res = await fetcher(sampleUrl(name, base));
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      return new File([await res.arrayBuffer()], name, { type: 'text/csv' });
    }),
  );
}
