import { formatYen } from '../lib/format';
import type { Change } from '../lib/series';

/** 増減の表示（▲増加・▼減少）。null は比較対象なし */
export function ChangeText({ c, showRatio = true }: { c: Change | null; showRatio?: boolean }) {
  if (!c) return <span className="text-muted">—</span>;
  if (c.diff === 0) return <span className="text-muted">±0</span>;
  const up = c.diff > 0;
  return (
    <span className="tabular whitespace-nowrap">
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? '増加' : '減少'}</span>
      {formatYen(Math.abs(c.diff))}
      {showRatio && c.ratio !== null && <span className="text-muted">（{up ? '+' : '-'}{Math.round(Math.abs(c.ratio) * 1000) / 10}%）</span>}
    </span>
  );
}
