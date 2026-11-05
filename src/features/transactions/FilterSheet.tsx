import { useMemo, type ReactNode } from 'react';
import { Chips, Segmented } from '../../components/Chips';
import { Sheet } from '../../components/Sheet';
import { middleByLarge, uniqueValues } from '../../lib/aggregate';
import { shiftYm } from '../../lib/date';
import { applyFilter, monthRange } from '../../lib/filter';
import { formatCount } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';

export function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);
  const resetFilter = useAppStore((s) => s.resetFilter);

  const larges = useMemo(() => uniqueValues(transactions, 'large'), [transactions]);
  const institutions = useMemo(() => uniqueValues(transactions, 'institution'), [transactions]);
  const middleMap = useMemo(() => middleByLarge(transactions), [transactions]);
  const middles = useMemo(() => {
    const src = filter.large.length ? filter.large : larges;
    return [...new Set(src.flatMap((l) => middleMap.get(l) ?? []))].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [filter.large, larges, middleMap]);
  const count = useMemo(
    () => (open ? applyFilter(transactions, filter, excluded).length : 0),
    [open, transactions, filter, excluded],
  );

  // 期間のプリセットは「データの最新月」を基準にする（年月を直書きしない）
  const latestYm = transactions[0]?.ym;
  const presets = latestYm
    ? [
        { label: '最新月', ...monthRange(latestYm) },
        { label: 'その前月', ...monthRange(shiftYm(latestYm, -1)) },
        { label: '直近12か月', dateFrom: monthRange(shiftYm(latestYm, -11)).dateFrom, dateTo: monthRange(latestYm).dateTo },
        { label: `${latestYm.slice(0, 4)}年`, dateFrom: `${latestYm.slice(0, 4)}-01-01`, dateTo: `${latestYm.slice(0, 4)}-12-31` },
      ]
    : [];

  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Math.abs(Number(v)));

  return (
    <Sheet
      open={open}
      title="絞り込み"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={resetFilter} className="h-12 flex-1 rounded-xl border border-line font-medium">
            条件をクリア
          </button>
          <button type="button" onClick={onClose} className="h-12 flex-[2] rounded-xl bg-accent font-bold text-white">
            {formatCount(count)}を表示
          </button>
        </div>
      }
    >
      <Field label="期間">
        <div className="mb-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setFilter({ dateFrom: p.dateFrom, dateTo: p.dateTo })}
              className={`min-h-11 rounded-full border px-3 text-sm ${filter.dateFrom === p.dateFrom && filter.dateTo === p.dateTo ? 'border-accent bg-accent-soft' : 'border-line'}`}
            >
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => setFilter({ dateFrom: '', dateTo: '' })} className="min-h-11 rounded-full border border-line px-3 text-sm">
            全期間
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={filter.dateFrom} onChange={(e) => setFilter({ dateFrom: e.target.value })} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-2" aria-label="開始日" />
          <span className="text-muted">〜</span>
          <input type="date" value={filter.dateTo} onChange={(e) => setFilter({ dateTo: e.target.value })} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-2" aria-label="終了日" />
        </div>
      </Field>

      <Field label="収入／支出">
        <Segmented
          value={filter.flow}
          onChange={(flow) => setFilter({ flow })}
          options={[
            { value: 'all', label: 'すべて' },
            { value: 'expense', label: '支出' },
            { value: 'income', label: '収入' },
          ]}
        />
      </Field>

      <Field label="大項目">
        <Chips
          options={larges}
          selected={filter.large}
          onChange={(large) => {
            // 大項目を変えたら、該当しない中項目の選択は外す
            const allowed = new Set((large.length ? large : larges).flatMap((l) => middleMap.get(l) ?? []));
            setFilter({ large, middle: filter.middle.filter((m) => allowed.has(m)) });
          }}
        />
      </Field>

      <Field label="中項目">
        <Chips options={middles} selected={filter.middle} onChange={(middle) => setFilter({ middle })} />
      </Field>

      <Field label="保有金融機関">
        <Chips options={institutions} selected={filter.institutions} onChange={(v) => setFilter({ institutions: v })} />
      </Field>

      <Field label="金額の範囲（円）">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="下限"
            value={filter.amountMin ?? ''}
            onChange={(e) => setFilter({ amountMin: num(e.target.value) })}
            className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3"
            aria-label="金額の下限"
          />
          <span className="text-muted">〜</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="上限"
            value={filter.amountMax ?? ''}
            onChange={(e) => setFilter({ amountMax: num(e.target.value) })}
            className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3"
            aria-label="金額の上限"
          />
        </div>
        <p className="mt-1 text-xs text-muted">収入・支出とも金額の大きさ（絶対値）で比べます。</p>
      </Field>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      {children}
    </fieldset>
  );
}
