import { useMemo, useState, type ReactNode } from 'react';
import { Chips, Segmented } from '../../components/Chips';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Sheet';
import { middleByLarge, uniqueValues } from '../../lib/aggregate';
import { formatCount, formatYen } from '../../lib/format';
import { isEmptyConditions, previewRule } from '../../lib/rules';
import { cleanConditions, suggestName } from '../../lib/ruleText';
import type { ExclusionRule, RuleConditions } from '../../lib/types';
import { useAppStore } from '../../store/useAppStore';

type ContentOp = NonNullable<RuleConditions['content']>['op'];

interface Props {
  /** 編集対象（新規作成時は draftRule() の結果） */
  rule: ExclusionRule;
  isNew: boolean;
  onClose: () => void;
}

export function RuleEditor({ rule, isNew, onClose }: Props) {
  const transactions = useAppStore((s) => s.transactions);
  const saveRule = useAppStore((s) => s.saveRule);
  const deleteRule = useAppStore((s) => s.deleteRule);

  const [name, setName] = useState(rule.name);
  const [cond, setCond] = useState<RuleConditions>(rule.cond);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const patch = (p: Partial<RuleConditions>) => setCond((c) => ({ ...c, ...p }));

  const larges = useMemo(() => uniqueValues(transactions, 'large'), [transactions]);
  const institutions = useMemo(() => uniqueValues(transactions, 'institution'), [transactions]);
  const middleMap = useMemo(() => middleByLarge(transactions), [transactions]);
  const middles = useMemo(() => {
    const src = cond.large?.length ? cond.large : larges;
    return [...new Set(src.flatMap((l) => middleMap.get(l) ?? []))].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [cond.large, larges, middleMap]);

  const cleaned = useMemo(() => cleanConditions(cond), [cond]);
  const empty = isEmptyConditions(cleaned);
  const preview = useMemo(
    () => (empty ? null : previewRule({ ...rule, cond: cleaned, enabled: true }, transactions)),
    [empty, rule, cleaned, transactions],
  );
  const autoName = suggestName(cleaned);
  const canSave = !empty;

  const save = async () => {
    await saveRule({ ...rule, name: name.trim() || autoName, cond: cleaned, updatedAt: Date.now() });
    onClose();
  };

  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Math.abs(Number(v)));

  return (
    <Sheet
      open
      title={isNew ? '除外ルールを追加' : '除外ルールを編集'}
      onClose={onClose}
      footer={
        <div>
          <div className="mb-2 rounded-lg bg-bg p-2 text-center text-sm" aria-live="polite">
            {preview ? (
              <>
                このルールで <b>{formatCount(preview.count)}</b> が除外されます
                {preview.count > 0 && (
                  <span className="tabular block text-xs text-muted">
                    支出 {formatYen(preview.expense)}
                    {preview.income > 0 && ` ／ 収入 ${formatYen(preview.income)}`}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">条件を1つ以上指定してください</span>
            )}
          </div>
          <div className="flex gap-2">
            {!isNew && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="h-12 flex-1 rounded-xl border border-danger font-medium text-danger">
                削除
              </button>
            )}
            <button type="button" disabled={!canSave} onClick={save} className="h-12 flex-[2] rounded-xl bg-accent font-bold text-white disabled:opacity-40">
              保存
            </button>
          </div>
        </div>
      }
    >
      <Field label="ルール名">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={autoName || '例：カード引き落とし'}
          className="h-11 w-full rounded-lg border border-line px-3"
        />
      </Field>

      <p className="mb-4 text-xs leading-relaxed text-muted">指定した条件にすべて当てはまる明細を、集計から除外します（指定しない項目は条件になりません）。</p>

      <Field label="内容">
        <div className="flex gap-2">
          <select
            value={cond.content?.op ?? 'contains'}
            onChange={(e) => patch({ content: { op: e.target.value as ContentOp, value: cond.content?.value ?? '' } })}
            className="h-11 shrink-0 rounded-lg border border-line bg-surface px-2"
            aria-label="一致のしかた"
          >
            <option value="contains">を含む</option>
            <option value="equals">と完全一致</option>
            <option value="startsWith">で始まる</option>
          </select>
          <input
            value={cond.content?.value ?? ''}
            onChange={(e) => patch({ content: { op: cond.content?.op ?? 'contains', value: e.target.value } })}
            placeholder="例：引き落とし"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3"
            aria-label="内容の文字列"
          />
        </div>
        <p className="mt-1 text-xs text-muted">全角・半角、大文字・小文字の違いは区別しません。</p>
      </Field>

      <Field label="保有金融機関">
        <Chips options={institutions} selected={cond.institutions ?? []} onChange={(v) => patch({ institutions: v })} />
      </Field>

      <Field label="大項目">
        <Chips
          options={larges}
          selected={cond.large ?? []}
          onChange={(large) => {
            const allowed = new Set((large.length ? large : larges).flatMap((l) => middleMap.get(l) ?? []));
            patch({ large, middle: (cond.middle ?? []).filter((m) => allowed.has(m)) });
          }}
        />
      </Field>

      <Field label="中項目">
        <Chips options={middles} selected={cond.middle ?? []} onChange={(v) => patch({ middle: v })} />
      </Field>

      <Field label="収入／支出">
        <Segmented
          value={cond.flow ?? 'all'}
          onChange={(v) => patch({ flow: v === 'all' ? undefined : v })}
          options={[
            { value: 'all', label: '指定なし' },
            { value: 'expense', label: '支出' },
            { value: 'income', label: '収入' },
          ]}
        />
      </Field>

      <Field label="金額の範囲（円）">
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={0} placeholder="下限" value={cond.amountMin ?? ''} onChange={(e) => patch({ amountMin: num(e.target.value) })} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3" aria-label="金額の下限" />
          <span className="text-muted">〜</span>
          <input type="number" inputMode="numeric" min={0} placeholder="上限" value={cond.amountMax ?? ''} onChange={(e) => patch({ amountMax: num(e.target.value) })} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3" aria-label="金額の上限" />
        </div>
      </Field>

      <Field label="適用期間（任意）">
        <div className="flex items-center gap-2">
          <input type="date" value={cond.dateFrom ?? ''} onChange={(e) => patch({ dateFrom: e.target.value || undefined })} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-2" aria-label="適用開始日" />
          <span className="text-muted">〜</span>
          <input type="date" value={cond.dateTo ?? ''} onChange={(e) => patch({ dateTo: e.target.value || undefined })} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-2" aria-label="適用終了日" />
        </div>
      </Field>

      <ConfirmDialog
        open={confirmDelete}
        title="このルールを削除しますか？"
        message="除外されていた明細は、ふたたび集計に含まれるようになります。"
        confirmLabel="削除する"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteRule(rule.id);
          onClose();
        }}
      />
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5 min-w-0">
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      {children}
    </fieldset>
  );
}
