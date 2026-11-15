import { useMemo, useState } from 'react';
import { Amount } from '../../components/Amount';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Sheet';
import { formatDateFull } from '../../lib/date';
import { formatCount } from '../../lib/format';
import type { Transaction } from '../../lib/types';
import { useAppStore, type MissingReview } from '../../store/useAppStore';

const PAGE_SIZE = 50;

/** 取り込んだ CSV にない明細の一覧。チェックを付けた明細だけを削除する（自動では消さない） */
export function MissingSheet() {
  const review = useAppStore((s) => s.missingReview);
  // 開くたびにチェックの状態を作り直す
  return review ? <MissingList key={review.transactions[0]?.id ?? ''} review={review} /> : null;
}

function MissingList({ review }: { review: MissingReview }) {
  const close = useAppStore((s) => s.closeMissingReview);
  const deleteTransactions = useAppStore((s) => s.deleteTransactions);
  const list = review.transactions;
  const [checked, setChecked] = useState<Set<string>>(() => new Set(review.preselect ? list.map((t) => t.id) : []));
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [confirm, setConfirm] = useState(false);

  const selected = useMemo(() => list.filter((t) => checked.has(t.id)), [list, checked]);
  const total = useMemo(() => selected.reduce((s, t) => s + t.amount, 0), [selected]);
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChecked = checked.size === list.length;

  return (
    <Sheet
      open
      title="CSVにない明細"
      onClose={close}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={close} className="h-12 flex-[2] rounded-xl border border-line font-medium">
            残して閉じる
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => setConfirm(true)}
            className="h-12 flex-[3] rounded-xl bg-danger font-bold text-on-danger disabled:opacity-40"
          >
            {formatCount(selected.length)}を削除
          </button>
        </div>
      }
    >
      <p className="text-xs leading-relaxed text-muted">
        取り込んだCSVの期間（最初の日付〜最後の日付）の明細のうち、アプリには保存されているのに、今回のCSVにはなかった明細です。
        マネーフォワードで削除・統合した明細なら、チェックを付けて削除すると二重の計上がなくなります。
      </p>
      {!review.preselect && (
        <p className="mt-2 rounded-lg bg-warn-soft p-3 text-xs leading-relaxed text-warn-ink">
          件数が多いため、最初はチェックを付けていません。別のアカウントのCSVや、一部の明細だけのCSVを取り込んだときにも、ここに出ます。
          消してよい明細だけにチェックを付けてください。
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="tabular text-sm">
          {formatCount(list.length)}中 <b>{formatCount(selected.length)}</b>を選択
        </p>
        <button
          type="button"
          onClick={() => setChecked(allChecked ? new Set() : new Set(list.map((t) => t.id)))}
          className="h-11 rounded-lg px-3 text-sm font-medium text-accent"
        >
          {allChecked ? 'すべて外す' : 'すべて選ぶ'}
        </button>
      </div>

      <ul className="mt-1 divide-y divide-line border-y border-line">
        {list.slice(0, limit).map((t) => (
          <MissingRow key={t.id} t={t} checked={checked.has(t.id)} onToggle={() => toggle(t.id)} />
        ))}
      </ul>
      {list.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)} className="mt-3 h-11 w-full rounded-xl bg-bg text-sm font-medium text-accent">
          さらに表示（残り{formatCount(list.length - limit)}）
        </button>
      )}

      <ConfirmDialog
        open={confirm}
        title={`${formatCount(selected.length)}の明細を削除`}
        message={
          <>
            <p>
              選んだ明細（合計 <Amount value={total} className="font-bold" />）を、このアプリから削除します。マネーフォワードのデータは変わりません。
            </p>
            <p className="mt-2">間違えて消したときは、その明細が入っているCSVを取り込み直すと戻ります。</p>
          </>
        }
        confirmLabel="削除する"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          await deleteTransactions(selected.map((t) => t.id));
          setConfirm(false);
          close();
        }}
      />
    </Sheet>
  );
}

function MissingRow({ t, checked, onToggle }: { t: Transaction; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
        <input type="checkbox" checked={checked} onChange={onToggle} className="size-5 shrink-0 accent-[var(--color-accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{t.content || '（内容なし）'}</span>
          <span className="block truncate text-xs text-muted">
            {formatDateFull(t.date)}・{t.institution || '金融機関なし'}・{t.large}
            {t.isTransfer && '・振替'}
          </span>
        </span>
        <Amount value={t.amount} className="shrink-0 text-sm font-bold" />
      </label>
    </li>
  );
}
