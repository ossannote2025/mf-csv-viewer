interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/** 複数選択できるチップ */
export function Chips({ options, selected, onChange }: Props) {
  if (options.length === 0) return <p className="text-sm text-muted">選択肢がありません</p>;
  const set = new Set(selected);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = set.has(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
            className={`min-h-11 rounded-full border px-3 text-sm ${on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface'}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** onHeader: 濃紺のヘッダーの中に置くときの配色 */
  tone?: 'default' | 'onHeader';
}

export function Segmented<T extends string>({ value, options, onChange, tone = 'default' }: SegProps<T>) {
  const onHeader = tone === 'onHeader';
  return (
    <div className={`flex rounded-xl p-1 ${onHeader ? 'bg-white/10' : 'bg-bg'}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-10 flex-1 rounded-lg text-sm ${
            o.value === value
              ? onHeader
                ? 'bg-on-header font-bold text-header-ink shadow-sm'
                : 'bg-raised font-bold shadow-sm'
              : onHeader
                ? 'text-on-header/75'
                : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
