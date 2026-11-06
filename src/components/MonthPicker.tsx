import { formatYm } from '../lib/date';
import type { MonthInfo } from '../lib/aggregate';
import { ChevronLeft, ChevronRight } from './Icons';

/** 月の選択（前月・翌月ボタン付き）。months は新しい順 */
export function MonthPicker({ months, value, onChange }: { months: MonthInfo[]; value: string; onChange: (ym: string) => void }) {
  const idx = months.findIndex((m) => m.ym === value);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={idx >= months.length - 1}
        onClick={() => onChange(months[idx + 1].ym)}
        className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm disabled:opacity-30"
        aria-label="前の月"
      >
        <ChevronLeft />
      </button>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 flex-1 rounded-xl bg-surface px-3 text-center font-bold shadow-sm" aria-label="月を選ぶ">
        {months.map((m) => (
          <option key={m.ym} value={m.ym}>
            {formatYm(m.ym)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={idx <= 0}
        onClick={() => onChange(months[idx - 1].ym)}
        className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm disabled:opacity-30"
        aria-label="次の月"
      >
        <ChevronRight />
      </button>
    </div>
  );
}
