import { useMemo } from 'react';
import { Card } from '../../components/Page';
import { ChevronRight } from '../../components/Icons';
import { formatYm } from '../../lib/date';
import { formatYen } from '../../lib/format';
import { findRecurring, MIN_MONTHLY_RUN, type RecurringItem } from '../../lib/recurring';
import { useAppStore } from '../../store/useAppStore';

/** 固定費・定期支払いの一覧（提案④） */
export function RecurringView() {
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const r = useMemo(() => findRecurring(transactions, excluded), [transactions, excluded]);
  const activeCount = r.monthly.length + r.periodic.length;

  if (activeCount + r.stopped.length === 0) {
    return (
      <Card>
        <p className="text-sm">固定費・定期的な支払いは見つかりませんでした。</p>
        <p className="mt-2 text-xs text-muted">
          同じ内容の支出が{MIN_MONTHLY_RUN}か月以上続けて毎月同じ日ごろにあるもの、毎年・数か月ごとに同じくらいの金額で続いているものを表示します（食費・交通費・ガソリンなどは除く）。{MIN_MONTHLY_RUN}
          か月分以上のデータを取り込むと表示されます。
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-sm text-muted">毎月の固定費（見込み）</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="tabular text-2xl font-bold text-expense">{formatYen(r.monthlyTotal)}</span>
          <span className="text-sm text-muted">/ 月</span>
        </p>
        <p className="tabular mt-1 text-sm">年間にすると {formatYen(r.monthlyTotal * 12)}</p>
        <p className="mt-3 text-xs text-muted">
          {activeCount}件・{formatYm(r.latestYm)}までのデータから、同じ内容の支出が毎月同じ日ごろ・定期的に出ているものを自動で見つけています（食費・交通費・ガソリンなどは除く）。固定費ではないものが含まれることがあります。
        </p>
      </Card>

      <Section title="毎月" items={r.monthly} />
      <Section title="年1回・数か月ごと" items={r.periodic} />
      <Section title="最近止まったもの" items={r.stopped} stopped />
    </>
  );
}

function Section({ title, items, stopped }: { title: string; items: RecurringItem[]; stopped?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Card title={`${title}（${items.length}件）`}>
      <ul className="-mx-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item.key}>
            <Row item={item} stopped={stopped} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 明細の検索に使う言葉：「10月分」などの数字より前の部分（月ごとに変わる部分で検索が外れないように） */
function searchWord(label: string): string {
  const head = label.split(/[0-9０-９]/)[0].trim();
  return head.length >= 2 ? head : label;
}

function schedule(item: RecurringItem, stopped?: boolean): string {
  const unit = item.intervalMonths === 1 ? 'か月' : item.intervalMonths === 12 ? '年' : '回';
  if (stopped) return `${formatYm(item.lastYm)}まで（${item.count}${unit}続いていました）`;
  if (item.intervalMonths === 1) return `毎月${item.day}日ごろ・${item.count}か月連続`;
  if (item.intervalMonths === 12) return `毎年${item.month}月ごろ・${item.count}年連続`;
  return `${item.intervalMonths}か月ごと・${item.count}回`;
}

function amountText(item: RecurringItem): string {
  const yen = formatYen(item.amount);
  if (item.intervalMonths === 12) return `${yen} / 年`;
  if (item.intervalMonths > 1) return `${yen} / ${item.intervalMonths}か月`;
  return item.variable ? `${yen} 前後` : yen;
}

function Row({ item, stopped }: { item: RecurringItem; stopped?: boolean }) {
  const showTransactions = useAppStore((s) => s.showTransactions);
  return (
    <button
      type="button"
      onClick={() => showTransactions({ keyword: searchWord(item.label), flow: 'expense' })}
      className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left active:bg-bg"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{item.label}</span>
          <span className={`tabular shrink-0 text-sm font-bold ${stopped ? 'text-muted' : ''}`}>{amountText(item)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {schedule(item, stopped)}・{item.institution}
        </span>
        <Spark points={item.history} />
        {item.priceChange && !stopped && (
          <span className="tabular mt-1.5 inline-block rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-ink">
            <span aria-hidden="true">⚠ </span>
            {Number(item.priceChange.ym.slice(5))}月から {formatYen(item.priceChange.from)} → {formatYen(item.priceChange.to)}
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </button>
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
