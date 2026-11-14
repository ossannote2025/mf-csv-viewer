import { useMemo, useState } from 'react';
import { Amount } from '../../components/Amount';
import { Segmented } from '../../components/Chips';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Sheet';
import { formatDateFull, formatYm } from '../../lib/date';
import {
  countCandidates,
  dismissDuplicate,
  dismissWithdrawal,
  duplicateRule,
  filterByMonth,
  withdrawalLabel,
  withdrawalRules,
  type DuplicatePair,
  type WithdrawalGroup,
} from '../../lib/doubleCount';
import { formatCount, formatYen } from '../../lib/format';
import { previewRules } from '../../lib/rules';
import { draftRule } from '../../lib/ruleText';
import type { ExclusionRule, RuleConditions } from '../../lib/types';
import { useAppStore } from '../../store/useAppStore';

type View = 'withdrawal' | 'duplicate';

/** 二重計上の候補の一覧（設定タブ・集計タブ・取り込み結果から開く） */
export function DoubleCountSheet() {
  const sheet = useAppStore((s) => s.doubleCountSheet);
  if (!sheet) return null;
  // 開くたびに切り替えの状態を初期化する
  return <DoubleCountSheetBody key={sheet.ym ?? 'all'} ym={sheet.ym} />;
}

function DoubleCountSheetBody({ ym }: { ym?: string }) {
  const all = useAppStore((s) => s.doubleCount);
  const close = useAppStore((s) => s.closeDoubleCount);
  const rules = useAppStore((s) => s.rules);
  const transactions = useAppStore((s) => s.transactions);
  const addRules = useAppStore((s) => s.addRules);
  const dismissCandidates = useAppStore((s) => s.dismissCandidates);

  const result = useMemo(() => (ym ? filterByMonth(all, ym) : all), [all, ym]);
  const counts = countCandidates(all, ym);
  const [view, setView] = useState<View>(() => (counts.withdrawals === 0 && counts.duplicates > 0 ? 'duplicate' : 'withdrawal'));
  const [pending, setPending] = useState<{ title: string; rules: ExclusionRule[] } | null>(null);
  const preview = useMemo(() => (pending ? previewRules(pending.rules, transactions) : null), [pending, transactions]);

  const askExclude = (title: string, specs: { name: string; cond: RuleConditions }[]) => {
    const base = draftRule(rules).order;
    setPending({ title, rules: specs.map((s, i) => ({ ...draftRule(rules, s.cond, s.name), order: base + i })) });
  };

  return (
    <Sheet open title={ym ? `二重計上の候補（${formatYm(ym)}）` : '二重計上の候補'} onClose={close}>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        振替になっていないカードの引き落としや、通販サイトとカードの両方に入った買い物の候補です。除外すると、除外ルールが作られます（データは消えません）。
      </p>

      {counts.total === 0 ? (
        <p className="py-10 text-center text-muted">二重計上の候補はありません</p>
      ) : (
        <>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'withdrawal', label: `カード引き落とし ${formatCount(counts.withdrawals)}` },
              { value: 'duplicate', label: `重複購入 ${formatCount(counts.duplicates)}` },
            ]}
          />
          <div className="mt-3 space-y-3">
            {view === 'withdrawal' ? (
              result.withdrawals.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">カード引き落としの候補はありません</p>
              ) : (
                result.withdrawals.map((g) => (
                  <WithdrawalCard
                    key={g.key}
                    g={g}
                    ym={ym}
                    onExclude={() => askExclude(`${withdrawalLabel(g)}の引き落としを除外`, withdrawalRules(g))}
                    onDismiss={() => dismissCandidates(dismissWithdrawal(g))}
                  />
                ))
              )
            ) : result.duplicates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">重複購入の候補はありません</p>
            ) : (
              result.duplicates.map((p) => (
                <DuplicateCard
                  key={p.key}
                  p={p}
                  onExclude={() => askExclude('カード側の明細を除外', [duplicateRule(p)])}
                  onDismiss={() => dismissCandidates([dismissDuplicate(p)])}
                />
              ))
            )}
          </div>
        </>
      )}

      <DismissedList />

      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ''}
        message={
          pending &&
          preview && (
            <>
              <p>次の除外ルールを作ります。</p>
              <ul className="my-2 list-disc pl-5 text-ink">
                {pending.rules.map((r) => (
                  <li key={r.id} className="break-all">
                    {r.name}
                  </li>
                ))}
              </ul>
              <p>
                <b className="text-ink">{formatCount(preview.count)}</b>・支出 <b className="tabular text-ink">{formatYen(preview.expense)}</b>{' '}
                が集計から除外されます。ルールは設定タブの「除外ルール」でOFF・削除できます。
              </p>
            </>
          )
        }
        confirmLabel="除外する"
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (pending) await addRules(pending.rules);
          setPending(null);
        }}
      />
    </Sheet>
  );
}

function ActionButtons({ excludeLabel, onExclude, onDismiss }: { excludeLabel: string; onExclude: () => void; onDismiss: () => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={onExclude} className="min-h-11 flex-[3] rounded-lg bg-accent px-2 text-sm font-bold text-on-accent">
        {excludeLabel}
      </button>
      <button type="button" onClick={onDismiss} className="min-h-11 flex-[2] rounded-lg border border-line px-2 text-sm font-medium">
        二重ではない
      </button>
    </div>
  );
}

function WithdrawalCard({ g, ym, onExclude, onDismiss }: { g: WithdrawalGroup; ym?: string; onExclude: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const matched = g.items.filter((i) => i.amountMatched).length;
  const inMonth = ym ? g.items.filter((i) => i.t.ym === ym).length : 0;
  return (
    <section className="rounded-xl border border-line p-3">
      <h3 className="font-bold break-all">{withdrawalLabel(g)}の引き落とし</h3>
      <dl className="mt-1 space-y-0.5 text-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">口座</dt>
          <dd className="break-all">{g.bank}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">内容</dt>
          <dd className="min-w-0 break-all">{g.contents.map((c) => `「${c}」`).join('、')}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">件数</dt>
          <dd className="tabular">
            {formatCount(g.items.length)}・合計 {formatYen(g.total)}
            {ym && <span className="text-muted">（この月 {formatCount(inMonth)}）</span>}
          </dd>
        </div>
      </dl>
      {g.card ? (
        <p className="mt-1 text-xs text-muted">
          {g.identifiedBy === 'amount' ? '引き落とし額からカードを推定しました。' : ''}
          {matched > 0 && `${formatCount(matched)}はカードの利用額とほぼ一致しています。`}
        </p>
      ) : (
        <p className="mt-2 rounded-lg bg-warn-soft p-2 text-xs leading-relaxed text-warn-ink">
          どのカードの引き落としか特定できませんでした。カードをマネーフォワードに連携していない場合は、二重ではありません。
        </p>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 min-h-11 text-sm text-accent">
        {open ? '明細を閉じる' : '明細を見る'}
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line text-sm">
          {g.items.map(({ t, amountMatched }) => (
            <li key={t.id} className={`flex items-center justify-between gap-2 py-2 ${ym && t.ym === ym ? 'font-bold' : ''}`}>
              <span className="tabular">{formatDateFull(t.date)}</span>
              <span className="flex items-center gap-2">
                {amountMatched && <span className="rounded bg-badge px-1.5 text-[11px] font-normal text-badge-ink">利用額と一致</span>}
                <Amount value={t.amount} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <ActionButtons excludeLabel={`${formatCount(g.items.length)}を振替として除外`} onExclude={onExclude} onDismiss={onDismiss} />
    </section>
  );
}

function DuplicateCard({ p, onExclude, onDismiss }: { p: DuplicatePair; onExclude: () => void; onDismiss: () => void }) {
  const rows = [
    { tag: '通販', t: p.ec },
    { tag: 'カード側', t: p.card },
  ];
  return (
    <section className="rounded-xl border border-line p-3">
      <ul className="space-y-2">
        {rows.map(({ tag, t }) => (
          <li key={t.id} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-badge px-1.5 text-[11px] text-badge-ink">{tag}</span>
                <span className="tabular text-muted">{formatDateFull(t.date)}</span>
              </p>
              <p className="mt-0.5 font-medium break-all">{t.content || '（内容なし）'}</p>
              <p className="text-xs break-all text-muted">{t.institution}</p>
            </div>
            <Amount value={t.amount} className="pt-5" />
          </li>
        ))}
      </ul>
      <ActionButtons excludeLabel="カード側を除外" onExclude={onExclude} onDismiss={onDismiss} />
    </section>
  );
}

/** 「二重ではない」とした候補の一覧（もとに戻せる） */
function DismissedList() {
  const dismissed = useAppStore((s) => s.dismissed);
  const undismiss = useAppStore((s) => s.undismissCandidates);
  const [open, setOpen] = useState(false);
  if (dismissed.length === 0) return null;
  const sorted = [...dismissed].sort((a, b) => b.dismissedAt - a.dismissedAt);
  return (
    <div className="mt-4 border-t border-line pt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-11 text-sm text-accent">
        非表示にした候補（{formatCount(dismissed.length)}）{open ? 'を閉じる' : 'をもとに戻す'}
      </button>
      {open && (
        <ul className="divide-y divide-line text-sm">
          {sorted.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 py-2 break-all">
                <span className="mr-1 text-xs text-muted">{d.kind === 'withdrawal' ? '引き落とし' : '重複購入'}</span>
                {d.label || d.key}
              </span>
              <button type="button" onClick={() => undismiss([d.key])} className="h-11 shrink-0 px-2 text-accent">
                もとに戻す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
