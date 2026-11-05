const nf = new Intl.NumberFormat('ja-JP');

/** 12345 → '¥12,345'、-12345 → '-¥12,345' */
export function formatYen(n: number, opts: { sign?: boolean } = {}): string {
  const abs = `¥${nf.format(Math.abs(Math.round(n)))}`;
  if (n < 0) return `-${abs}`;
  if (opts.sign && n > 0) return `+${abs}`;
  return abs;
}

export function formatCount(n: number): string {
  return `${nf.format(n)}件`;
}

/** 検索用の正規化（全角半角・大文字小文字の違いを吸収） */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}
