import { useEffect, useMemo, useRef, useState } from 'react';
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
import { RuleEditor } from './RuleEditor';
import { describeConditions, draftRule } from '../../lib/ruleText';
import { previewRule } from '../../lib/rules';
import { backupIsStale, BackupError } from '../../lib/backup';
import type { ExclusionRule } from '../../lib/types';

export function SettingsTab() {
  return (
    <Page title="設定">
      <Card title="CSVの取り込み">
        <ImportPanel />
      </Card>
      <StorageStatus />
      <MonthList />
      <RuleSection />
      <BackupSection />
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
    ['最終バックアップ日', meta.lastBackupAt ? formatTimestamp(meta.lastBackupAt) : 'まだありません'],
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
  const transactions = useAppStore((s) => s.transactions);
  const excluded = useAppStore((s) => s.excluded);
  const saveRule = useAppStore((s) => s.saveRule);
  const [editing, setEditing] = useState<{ rule: ExclusionRule; isNew: boolean } | null>(null);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const ids of excluded.values()) for (const id of ids) c.set(id, (c.get(id) ?? 0) + 1);
    // OFFのルールは、ONにした場合の件数を表示する
    for (const r of rules) if (!r.enabled) c.set(r.id, previewRule(r, transactions).count);
    return c;
  }, [excluded, rules, transactions]);

  return (
    <Card title="除外ルール">
      <p className="mb-2 text-xs leading-relaxed text-muted">
        ONのルールのどれかに当てはまる明細は、集計に含めません（データは削除されず、明細一覧ではグレーで表示されます）。
      </p>
      <ul className="divide-y divide-line">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-1">
            <button
              type="button"
              disabled={!!r.builtin}
              onClick={() => setEditing({ rule: r, isNew: false })}
              className="min-h-14 min-w-0 flex-1 py-2 text-left disabled:cursor-default"
            >
              <p className={`truncate font-medium ${r.enabled ? '' : 'text-muted'}`}>
                {r.name}
                {r.builtin && <span className="ml-2 rounded bg-bg px-1.5 text-[11px] text-muted">組み込み</span>}
              </p>
              {!r.builtin && <p className="truncate text-xs text-muted">{describeConditions(r.cond)}</p>}
              <p className="text-xs text-muted">
                {formatCount(counts.get(r.id) ?? 0)}
                {r.enabled ? 'を除外中' : 'が該当（OFF）'}
              </p>
            </button>
            <Toggle checked={r.enabled} label={`${r.name}を${r.enabled ? 'OFF' : 'ON'}にする`} onChange={(enabled) => saveRule({ ...r, enabled, updatedAt: Date.now() })} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setEditing({ rule: draftRule(rules), isNew: true })}
        className="mt-3 h-11 w-full rounded-xl bg-bg font-medium text-accent"
      >
        ＋ ルールを追加
      </button>
      <p className="mt-2 text-xs text-muted">明細を長押し（PCでは右クリック）するか、タップして「この明細から除外ルールを作る」からも作成できます。</p>
      {editing && <RuleEditor rule={editing.rule} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function BackupSection() {
  const exportBackup = useAppStore((s) => s.exportBackup);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const meta = useAppStore((s) => s.meta);
  const hasData = useAppStore((s) => s.transactions.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const stale = backupIsStale(meta.lastBackupAt, hasData);

  const doExport = async () => {
    setMessage(null);
    try {
      const r = await exportBackup();
      if (r === 'shared') setMessage({ ok: true, text: 'バックアップを書き出しました。' });
      else if (r === 'downloaded') setMessage({ ok: true, text: 'バックアップファイルをダウンロードしました。' });
    } catch (e) {
      setMessage({ ok: false, text: `書き出しに失敗しました（${e instanceof Error ? e.message : String(e)}）。` });
    }
  };

  return (
    <Card title="バックアップと復元">
      {stale && (
        <p className="mb-3 rounded-lg bg-warn-soft p-3 text-sm text-warn-ink">
          {meta.lastBackupAt ? '最後のバックアップから30日以上たっています。' : 'まだバックアップがありません。'}
          iPhoneでは長く使わないとデータが消えることがあるため、バックアップをおすすめします。
        </p>
      )}
      <button
        type="button"
        disabled={!hasData}
        onClick={doExport}
        className="h-12 w-full rounded-xl bg-accent font-bold text-white disabled:opacity-40"
      >
        バックアップを書き出す
      </button>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        全明細と除外ルールを1つのJSONファイルにまとめます。iPhoneでは共有メニューの「"ファイル"に保存」を選ぶと、iCloud Drive に保存できます。
        バックアップファイルには家計データが含まれるので、人に送ったり公開しないでください。
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            setMessage(null);
            setMode('replace');
            setPending(f);
          }
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 h-12 w-full rounded-xl border border-line font-medium">
        バックアップから復元
      </button>
      {message && <p className={`mt-3 text-sm ${message.ok ? 'text-income' : 'text-danger'}`}>{message.text}</p>}

      <ConfirmDialog
        open={!!pending}
        title="バックアップから復元"
        message={
          <div>
            <p className="break-all">{pending?.name}</p>
            <div className="mt-3 space-y-2 text-ink">
              <label className="flex min-h-11 items-start gap-2">
                <input type="radio" name="restore-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 size-5" />
                <span>
                  <b>置き換え</b>（おすすめ）
                  <span className="block text-xs text-muted">今のデータをすべて消して、バックアップの内容にします。</span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-2">
                <input type="radio" name="restore-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1 size-5" />
                <span>
                  <b>マージ</b>
                  <span className="block text-xs text-muted">今のデータを残したまま追加します。同じIDの明細・ルールはバックアップの内容で上書きします。</span>
                </span>
              </label>
            </div>
          </div>
        }
        confirmLabel="復元する"
        danger={mode === 'replace'}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          try {
            const r = await restoreBackup(pending, mode);
            setMessage({ ok: true, text: `${formatCount(r.count)}の明細を復元しました。` });
          } catch (e) {
            setMessage({ ok: false, text: e instanceof BackupError ? e.message : `復元に失敗しました（${e instanceof Error ? e.message : String(e)}）。` });
          }
          setPending(null);
        }}
      />
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
