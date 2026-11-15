const nf = new Intl.NumberFormat('ja-JP');

/** 12345 → '¥12,345'、-12345 → '-¥12,345' */
export function formatYen(n: number, opts: { sign?: boolean } = {}): string {
  const abs = `¥${nf.format(Math.abs(Math.round(n)))}`;
  if (n < 0) return `-${abs}`;
  if (opts.sign && n > 0) return `+${abs}`;
  return abs;
}

/** グラフの軸の目盛り：¥1.3億、¥6500万、¥30万、¥1.2万、¥5,000（幅 56px の軸に収まる長さにする） */
export function formatYenAxis(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const round1 = (v: number) => Math.round(v * 10) / 10;
  if (abs >= 1e8) return `${sign}¥${round1(abs / 1e8)}億`;
  if (abs >= 1e7) return `${sign}¥${Math.round(abs / 1e4)}万`;
  if (abs >= 1e4) return `${sign}¥${round1(abs / 1e4)}万`;
  return `${sign}¥${nf.format(abs)}`;
}

export function formatCount(n: number): string {
  return `${nf.format(n)}件`;
}

/** 検索用の正規化（全角半角・大文字小文字の違いを吸収） */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}
