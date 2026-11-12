import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { RANGE_PRESETS } from '../../lib/series';
import { formatYen } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import { useElementWidth } from '../../hooks/useElementWidth';

/** 期間の選択（12か月・2年・5年・全期間） */
export function RangeChips() {
  const value = useAppStore((s) => s.chartRange);
  const onChange = useAppStore((s) => s.setChartRange);
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pt-4" role="group" aria-label="期間">
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          aria-pressed={p.value === value}
          onClick={() => onChange(p.value)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${p.value === value ? 'border-accent bg-accent font-bold text-on-accent' : 'border-line bg-surface'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 月数が多いときは横スクロールにするグラフの枠。
 * 1か月あたり minPerMonth px を確保し、初期表示は最新月（右端）。
 */
export function ScrollableChart({ count, minPerMonth = 22, height = 240, children }: { count: number; minPerMonth?: number; height?: number; children: (width: number) => ReactNode }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWidth = Math.max(width, count * minPerMonth + 64);
  // 枠の幅（width）も見る：表示直後は width=0 でグラフが未描画のため、
  // 幅が決まってグラフを描いたあとに改めて右端（最新月）へ移動する
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [width, chartWidth, count]);
  return (
    <div ref={ref}>
      {/*
        期間を切り替えてグラフの幅が変わったら、スクロール枠ごと作り直す。
        iPhone の Safari は、中身が狭くなっても前のスクロール位置を引きずることがあり、
        グラフの外（空白）が表示されてグラフが消えたように見えるため。
      */}
      <div key={chartWidth} ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        {width > 0 && <div style={{ width: chartWidth, height }}>{children(chartWidth)}</div>}
      </div>
      {chartWidth > width && width > 0 && <p className="mt-1 text-xs text-muted">← 左にスクロールすると過去の月を表示します</p>}
    </div>
  );
}

interface TooltipRow {
  label: string;
  value: number;
  color?: string;
}

/** グラフの吹き出し（ホバー・タップ時） */
export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-bold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="tabular flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className="size-2.5 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="text-ink">{formatYen(r.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.line ? <span className="h-0.5 w-4 rounded" style={{ background: i.color }} /> : <span className="size-2.5 rounded-sm" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}
