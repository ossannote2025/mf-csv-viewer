import { formatYen } from '../lib/format';
import { changeTone, type Change } from '../lib/series';

const TONE_CLASS = { good: 'text-income', bad: 'text-danger', neutral: 'text-muted' } as const;

/**
 * 増減の表示（▲増加・▼減少）。null は比較対象なし
 * 色は家計にとっての良し悪し（緑＝良い変化、赤＝注意）。赤は灰色の背景でも AA を満たす danger を使う。kind が expense なら増加が赤、income / balance なら増加が緑
 */
export function ChangeText({ c, kind, showRatio = true }: { c: Change | null; kind: 'income' | 'expense' | 'balance'; showRatio?: boolean }) {
  if (!c) return <span className="text-muted">—</span>;
  if (c.diff === 0) return <span className="text-muted">±0</span>;
  const up = c.diff > 0;
  return (
    <span className="tabular whitespace-nowrap">
      <span className={TONE_CLASS[changeTone(c, kind)]}>
        <span aria-hidden="true">{up ? '▲' : '▼'}</span>
        <span className="sr-only">{up ? '増加' : '減少'}</span>
        {formatYen(Math.abs(c.diff))}
      </span>
      {showRatio && c.ratio !== null && <span className="text-muted">（{up ? '+' : '-'}{Math.round(Math.abs(c.ratio) * 1000) / 10}%）</span>}
    </span>
  );
}
