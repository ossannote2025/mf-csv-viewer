import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LockIcon, TrashIcon } from '../../components/Icons';
import { Card, Page } from '../../components/Page';
import { Toggle } from '../../components/Toggle';
import { dateRange, listMonths } from '../../lib/aggregate';
import { formatDateFull, formatTimestamp, formatYm } from '../../lib/date';
import { formatCount } from '../../lib/format';
import { getStorageEstimate } from '../../db/repo';
import { useAppStore } from '../../store/useAppStore';
import { ImportPanel } from './ImportPanel';

export function SettingsTab() {
  return (
    <Page title="設定">
      <Card title="CSVの取り込み">
        <ImportPanel />
      </Card>
      <StorageStatus />
      <MonthList />
      <RuleSection />
      <DangerZone />
      <About />
    </Page>
  );
}

function StorageStatus() {
  const transactions = useAppStore((s) => s.transactions);
  const meta = useAppStore((s) => s.meta);
  const persisted = useAppStore((s) => s.persisted);
  const range = useMemo(() => dateRange(transactions), [transactions]);
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    getStorageEstimate().then((e) => e && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)}MB`));
  }, [transactions]);

  const rows: [string, string][] = [
    ['保存件数', formatCount(transactions.length)],
    ['データの期間', range ? `${formatDateFull(range.from)} 〜 ${formatDateFull(range.to)}` : '—'],
    ['最終取り込み日', meta.lastImportAt ? formatTimestamp(meta.lastImportAt) : '—'],
    [
      '保存の永続化',
      persisted === true ? '許可されています' : persisted === false ? '許可されていません（ホーム画面に追加すると改善します）' : '確認できません',
    ],
  ];
  if (usage) rows.push(['使用容量', usage]);

  return (
    <Card title="保存状況">
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-11 items-center justify-between gap-4 py-2">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="tabular text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function MonthList() {
  const transactions = useAppStore((s) => s.transactions);
  const deleteMonth = useAppStore((s) => s.deleteMonth);
  const months = useMemo(() => listMonths(transactions), [transactions]);
  const [target, setTarget] = useState<{ ym: string; count: number } | null>(null);

  const byYear = useMemo(() => {
    const map = new Map<string, typeof months>();
    for (const m of months) {
      const y = m.ym.slice(0, 4);
      map.set(y, [...(map.get(y) ?? []), m]);
    }
    return [...map.entries()];
  }, [months]);

  return (
    <Card title={`取り込み済みの月（${months.length}か月）`}>
      {months.length === 0 ? (
        <p className="text-sm text-muted">まだ取り込まれていません。</p>
      ) : (
        <div className="-mx-1">
          {byYear.map(([year, list], i) => (
            <details key={year} open={i === 0} className="border-b border-line last:border-b-0">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-1 font-bold">
                <span>{year}年</span>
                <span className="text-xs font-normal text-muted">
                  {list.length}か月・{formatCount(list.reduce((s, m) => s + m.count, 0))}
                </span>
              </summary>
              <ul className="pb-2">
                {list.map((m) => (
                  <li key={m.ym} className="flex items-center justify-between pl-3 text-sm">
                    <span>
                      {formatYm(m.ym)} <span className="text-muted">{formatCount(m.count)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTarget(m)}
                      className="flex h-11 items-center gap-1 px-2 text-danger"
                      aria-label={`${formatYm(m.ym)}を削除`}
                    >
                      <TrashIcon className="size-5" />
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        title={target ? `${formatYm(target.ym)}の明細を削除` : ''}
        message={target && `${formatCount(target.count)}の明細を削除します。CSVを取り込み直せば元に戻せます。`}
        confirmLabel="削除する"
        danger
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          if (target) await deleteMonth(target.ym);
          setTarget(null);
        }}
      />
    </Card>
  );
}

function RuleSection() {
  const rules = useAppStore((s) => s.rules);
  const excluded = useAppStore((s) => s.excluded);
  const saveRule = useAppStore((s) => s.saveRule);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const ids of excluded.values()) for (const id of ids) c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [excluded]);

  return (
    <Card title="除外ルール">
      <p className="mb-2 text-xs leading-relaxed text-muted">
        ONのルールに当てはまる明細は、集計に含めません（データは削除されず、明細一覧ではグレーで表示されます）。
      </p>
      <ul className="divide-y divide-line">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {r.name}
                {r.builtin && <span className="ml-2 rounded bg-bg px-1.5 text-[11px] text-muted">組み込み</span>}
              </p>
              <p className="text-xs text-muted">{formatCount(counts.get(r.id) ?? 0)}が該当</p>
            </div>
            <Toggle checked={r.enabled} label={`${r.name}を${r.enabled ? 'OFF' : 'ON'}にする`} onChange={(enabled) => saveRule({ ...r, enabled, updatedAt: Date.now() })} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">独自の除外ルール（例：カード引き落とし）の作成は、次のアップデートで追加します。</p>
    </Card>
  );
}

function DangerZone() {
  const deleteAll = useAppStore((s) => s.deleteAll);
  const count = useAppStore((s) => s.transactions.length);
  const [open, setOpen] = useState(false);
  return (
    <Card title="データの削除">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger font-bold text-danger"
      >
        <TrashIcon className="size-5" />
        全データ削除
      </button>
      <p className="mt-2 text-xs text-muted">この端末に保存された明細・除外ルール・取り込み履歴をすべて削除します。</p>
      <ConfirmDialog
        open={open}
        title="全データを削除しますか？"
        message={`${formatCount(count)}の明細と、除外ルールの設定がすべて削除されます。元に戻せません。`}
        confirmLabel="すべて削除"
        danger
        requireText="削除"
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          await deleteAll();
          setOpen(false);
        }}
      />
    </Card>
  );
}

function About() {
  return (
    <Card title="このアプリについて">
      <div className="flex gap-3 text-sm leading-relaxed">
        <LockIcon className="size-6 shrink-0 text-accent" />
        <p>
          家計データはこの端末のブラウザ（IndexedDB）にだけ保存され、外部のサーバーには一切送信されません。
          アクセス解析や外部サービスの読み込みもしていません。
        </p>
      </div>
      <p className="mt-3 text-xs text-muted">バージョン {__APP_VERSION__}</p>
    </Card>
  );
}
