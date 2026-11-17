import { useMemo, useState } from 'react';
import { Card } from '../../components/Page';
import { Toggle } from '../../components/Toggle';
import { formatYm } from '../../lib/date';
import { formatYen } from '../../lib/format';
import { findRecurring, groupByChoice, MIN_MONTHS, STOPPED_AFTER_MONTHS, type RecurringItem } from '../../lib/recurring';
import { useAppStore } from '../../store/useAppStore';

/**
 * 固定費（0.10.0 で作り直し）。同じ名前で定期的に出ている支出を候補に出し、固定費に入れるかどうかはユーザーが選ぶ。
 * 固定費に入れたものは大項目ごとにまとめて、月あたりの合計を出す
 */
export function RecurringView() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const choices = useAppStore((s) => s.recurringChoices);
  const { latestYm, items } = useMemo(() => findRecurring(transactions, excluded), [transactions, excluded]);
  const g = useMemo(() => groupByChoice(items, choices), [items, choices]);
  const fixedCount = g.fixed.reduce((a, c) => a + c.items.length, 0);

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm">固定費の候補は見つかりませんでした。</p>
        <p className="mt-2 text-xs text-muted">{rulesText}</p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-sm text-muted">毎月の固定費（月あたり）</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="tabular text-2xl font-bold text-expense">{formatYen(g.monthlyTotal)}</span>
          <span className="text-sm text-muted">/ 月</span>
        </p>
        <p className="tabular mt-1 text-sm">年間にすると {formatYen(g.monthlyTotal * 12)}</p>
        <p className="mt-3 text-xs text-muted">
          {fixedCount === 0 ? '下の候補から、固定費に入れるものを選んでください。' : `固定費に入れた${fixedCount}件の合計です。`}
          {formatYm(latestYm)}までのデータから、{rulesText}
        </p>
      </Card>

      {g.undecided.length > 0 && (
        <Card title={`未確認の候補（${g.undecided.length}件）`}>
          <p className="-mt-1 mb-2 text-xs text-muted">固定費に入れるかどうかを選んでください。あとから変えられます。</p>
          <ul className="-mx-2 divide-y divide-line">
            {g.undecided.map((item) => (
              <li key={item.key}>
                <Row item={item} control={<DecideButtons item={item} />} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {g.fixed.length > 0 && (
        <Card title={`固定費（${fixedCount}件）`}>
          {g.fixed.map((c) => (
            <section key={c.large} className="mt-3 first:mt-0">
              <h3 className="flex items-baseline justify-between gap-2 border-b border-line pb-1 text-sm font-bold">
                <span className="truncate">{c.large}</span>
                <span className="tabular shrink-0">{formatYen(Math.round(c.monthlyTotal))} / 月</span>
              </h3>
              <ul className="-mx-2 divide-y divide-line">
                {c.items.map((item) => (
                  <li key={item.key}>
                    <Row item={item} control={<ChoiceToggle item={item} checked />} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Card>
      )}

      {g.fixedStopped.length > 0 && (
        <Card title={`最近止まった固定費（${g.fixedStopped.length}件）`}>
          <p className="-mt-1 mb-2 text-xs text-muted">最後の支払いから{STOPPED_AFTER_MONTHS}か月以上たったものです。上の合計には入れていません。</p>
          <ul className="-mx-2 divide-y divide-line">
            {g.fixedStopped.map((item) => (
              <li key={item.key}>
                <Row item={item} control={<ChoiceToggle item={item} checked />} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {g.notFixed.length > 0 && <NotFixed items={g.notFixed} />}
    </>
  );
}

const rulesText = `同じ名前の支出が直近12か月のうち${MIN_MONTHS}か月以上あるもの、2年続けて同じ月ごろにあるもの（年1回）を候補にしています（食費・日用品・交通費・ガソリンなどは除く）。月あたりの金額は12か月の合計÷12（年1回は1回分÷12）です。`;

function NotFixed({ items }: { items: RecurringItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold text-muted">
        <span>固定費ではないもの（{items.length}件）</span>
        <span className="text-accent">{open ? '閉じる' : '表示'}</span>
      </button>
      {open && (
        <ul className="-mx-2 mt-1 divide-y divide-line">
          {items.map((item) => (
            <li key={item.key}>
              <Row item={item} control={<ChoiceToggle item={item} checked={false} />} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DecideButtons({ item }: { item: RecurringItem }) {
  const setChoice = useAppStore((s) => s.setRecurringChoice);
  return (
    <span className="flex shrink-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void setChoice(item.key, item.label, 'fixed')}
        aria-label={`${item.label}を固定費に入れる`}
        className="min-h-11 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent"
      >
        入れる
      </button>
      <button
        type="button"
        onClick={() => void setChoice(item.key, item.label, 'notFixed')}
        aria-label={`${item.label}を固定費に入れない`}
        className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink"
      >
        入れない
      </button>
    </span>
  );
}

function ChoiceToggle({ item, checked }: { item: RecurringItem; checked: boolean }) {
  const setChoice = useAppStore((s) => s.setRecurringChoice);
  return <Toggle checked={checked} label={`${item.label}を固定費に入れる`} onChange={(v) => void setChoice(item.key, item.label, v ? 'fixed' : 'notFixed')} />;
}

function amountText(item: RecurringItem): string {
  if (item.kind === 'yearly') return `${formatYen(item.yearlyAmount)} / 年`;
  return `${formatYen(Math.round(item.monthlyCost))} / 月`;
}

function detail(item: RecurringItem): string {
  if (item.stopped) return `${formatYm(item.lastYm)}まで`;
  if (item.kind === 'yearly') return `毎年${Number(item.lastYm.slice(5))}月ごろ・${item.count}年`;
  return `12か月のうち${item.count}か月`;
}

function Row({ item, control }: { item: RecurringItem; control: React.ReactNode }) {
  const showTransactions = useAppStore((s) => s.showTransactions);
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => showTransactions({ pinned: { label: `固定費：${item.label}`, ids: item.ids } })}
        className="min-h-12 min-w-0 flex-1 rounded-lg px-2 py-2.5 text-left active:bg-bg"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{item.label}</span>
          <span className={`tabular shrink-0 text-sm font-bold ${item.stopped ? 'text-muted' : ''}`}>{amountText(item)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {detail(item)}・{item.large}・{item.institution}
        </span>
        <Spark points={item.history} />
      </button>
      {control}
    </div>
  );
}

/** 月ごとの金額の小さな棒グラフ（金額の文字は行にあるので、飾りとして読み上げない） */
function Spark({ points }: { points: { ym: string; amount: number }[] }) {
  const max = Math.max(...points.map((p) => p.amount), 1);
  return (
    <span aria-hidden="true" className="mt-1.5 flex h-6 items-end gap-0.5">
      {points.map((p) => (
        <span
          key={p.ym}
          className={`max-w-4 flex-1 rounded-sm ${p.amount > 0 ? 'bg-accent' : 'bg-line'}`}
          style={{ height: p.amount > 0 ? `${Math.max(12, (p.amount / max) * 100)}%` : '2px' }}
        />
      ))}
    </span>
  );
}
