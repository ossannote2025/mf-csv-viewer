import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Amount } from '../../components/Amount';
import { EyeIcon, EyeOffIcon, FilterIcon, SearchIcon, CloseIcon } from '../../components/Icons';
import { Page } from '../../components/Page';
import { totals } from '../../lib/aggregate';
import { formatDay } from '../../lib/date';
import { activeFilterCount, applyFilter } from '../../lib/filter';
import { formatCount, formatYen } from '../../lib/format';
import type { ExclusionRule, Transaction } from '../../lib/types';
import { draftRule } from '../../lib/ruleText';
import { RuleEditor } from '../settings/RuleEditor';
import { useAppStore } from '../../store/useAppStore';
import { FilterSheet } from './FilterSheet';
import { TransactionDetail } from './TransactionDetail';

type Item = { kind: 'day'; date: string; sum: number } | { kind: 'tx'; t: Transaction };

export function TransactionsTab() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const rules = useAppStore((s) => s.rules);
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [newRule, setNewRule] = useState<ExclusionRule | null>(null);

  const filtered = useMemo(() => applyFilter(transactions, filter, excluded), [transactions, filter, excluded]);
  const sum = useMemo(() => totals(filtered, excluded), [filtered, excluded]);
  const ruleNames = useMemo(() => new Map(rules.map((r) => [r.id, r.name])), [rules]);

  // 日付の見出し行を挟んだ表示用の配列
  const items = useMemo(() => {
    const out: Item[] = [];
    let current = '';
    let header: Extract<Item, { kind: 'day' }> | null = null;
    for (const t of filtered) {
      if (t.date !== current) {
        current = t.date;
        header = { kind: 'day', date: t.date, sum: 0 };
        out.push(header);
      }
      if (header && !excluded.has(t.id)) header.sum += t.amount;
      out.push({ kind: 'tx', t });
    }
    return out;
  }, [filtered, excluded]);

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => (items[i].kind === 'day' ? 36 : 64),
    overscan: 10,
    scrollMargin,
    getItemKey: (i) => {
      const it = items[i];
      return it.kind === 'day' ? `d-${it.date}` : it.t.id;
    },
  });

  const nFilters = activeFilterCount(filter);
  const excludedInView = sum.excludedCount;

  return (
    <Page
      title="明細"
      actions={
        <button
          type="button"
          onClick={() => setFilter({ showExcluded: !filter.showExcluded })}
          className="flex h-11 items-center gap-1 px-2 text-sm text-muted"
          aria-pressed={filter.showExcluded}
        >
          {filter.showExcluded ? <EyeIcon className="size-5" /> : <EyeOffIcon className="size-5" />}
          除外を{filter.showExcluded ? '表示中' : '非表示'}
        </button>
      }
    >
      <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-20 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">キーワード検索</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={filter.keyword}
              onChange={(e) => setFilter({ keyword: e.target.value })}
              placeholder="内容・メモを検索"
              className="h-11 w-full rounded-xl bg-bg pr-10 pl-10"
            />
            {filter.keyword && (
              <button
                type="button"
                onClick={() => setFilter({ keyword: '' })}
                className="absolute top-0 right-0 flex size-11 items-center justify-center text-muted"
                aria-label="キーワードを消す"
              >
                <CloseIcon className="size-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`relative flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium ${nFilters ? 'bg-accent text-white' : 'bg-bg'}`}
          >
            <FilterIcon className="size-5" />
            絞り込み
            {nFilters > 0 && <span className="ml-0.5 rounded-full bg-white px-1.5 text-xs text-accent">{nFilters}</span>}
          </button>
        </div>
        <div className="tabular mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>{formatCount(filtered.length)}</span>
          <span>
            収入 <span className="text-income">{formatYen(sum.income)}</span>
          </span>
          <span>
            支出 <span className="text-expense">{formatYen(sum.expense)}</span>
          </span>
          <span>
            収支 <Amount value={sum.balance} />
          </span>
          {excludedInView > 0 && <span>（除外 {excludedInView}件は集計外）</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted">条件に合う明細がありません。</p>
      ) : (
        <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const it = items[v.index];
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
              >
                {it.kind === 'day' ? (
                  <div className="flex h-9 items-end justify-between bg-bg px-4 pb-1 text-xs font-bold text-muted">
                    <span>{formatDay(it.date)}</span>
                    <Amount value={it.sum} className="font-normal" />
                  </div>
                ) : (
                  <TransactionRow t={it.t} hits={excluded.get(it.t.id)} ruleNames={ruleNames} onClick={() => setSelected(it.t)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} />
      <TransactionDetail
        t={selected}
        onClose={() => setSelected(null)}
        onCreateRule={(cond, name) => {
          setSelected(null);
          setNewRule(draftRule(rules, cond, name));
        }}
      />
      {newRule && <RuleEditor rule={newRule} isNew onClose={() => setNewRule(null)} />}
    </Page>
  );
}

function TransactionRow({
  t,
  hits,
  ruleNames,
  onClick,
}: {
  t: Transaction;
  hits?: string[];
  ruleNames: Map<string, string>;
  onClick: () => void;
}) {
  const isExcluded = !!hits;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 border-b border-line px-4 py-2 text-left active:bg-bg ${isExcluded ? 'bg-zinc-100 text-muted' : 'bg-surface'}`}
    >
      <div className="min-w-0 flex-1">
        <p className={`truncate ${isExcluded ? 'line-through decoration-zinc-400' : 'font-medium'}`}>{t.content || '（内容なし）'}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {t.large}／{t.middle}・{t.institution}
          {t.memo && <span>・📝{t.memo}</span>}
        </p>
        {hits && (
          <p className="mt-0.5 flex flex-wrap gap-1">
            {hits.map((id) => (
              <span key={id} className="rounded bg-zinc-200 px-1.5 text-[11px] text-zinc-600">
                除外: {ruleNames.get(id) ?? '不明なルール'}
              </span>
            ))}
          </p>
        )}
      </div>
      <Amount value={t.amount} muted={isExcluded} className="font-bold" />
    </button>
  );
}
