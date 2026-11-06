import type { ReactNode } from 'react';
import { Amount } from '../../components/Amount';
import { Sheet } from '../../components/Sheet';
import { formatDateFull } from '../../lib/date';
import type { RuleConditions, Transaction } from '../../lib/types';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  t: Transaction | null;
  onClose: () => void;
  /** 「この明細から除外ルールを作る」を押したとき */
  onCreateRule: (cond: RuleConditions, name: string) => void;
}

export function TransactionDetail({ t, onClose, onCreateRule }: Props) {
  const excluded = useAppStore((s) => s.excluded);
  const rules = useAppStore((s) => s.rules);
  if (!t) return null;
  const hits = excluded.get(t.id) ?? [];
  const rows: [string, ReactNode][] = [
    ['日付', formatDateFull(t.date)],
    ['金額', <Amount key="a" value={t.amount} className="font-bold" />],
    ['大項目', t.large],
    ['中項目', t.middle],
    ['保有金融機関', t.institution],
    ['メモ', t.memo || '—'],
    ['計算対象', t.isTarget ? '対象' : '対象外'],
    ['振替', t.isTransfer ? '振替' : '—'],
    ['取り込み元', t.sourceFile],
  ];
  return (
    <Sheet open title="明細の詳細" onClose={onClose}>
      <p className="text-lg font-bold break-all">{t.content || '（内容なし）'}</p>
      {hits.length > 0 ? (
        <div className="mt-3 rounded-lg bg-zinc-100 p-3 text-sm">
          <p className="font-bold">集計から除外されています</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {hits.map((id) => (
              <li key={id}>{rules.find((r) => r.id === id)?.name ?? '不明なルール'}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-11 items-center justify-between gap-4 py-2">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="text-right break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-sm font-bold">この明細から除外ルールを作る</p>
        <div className="flex flex-col gap-2">
          {t.content && (
            <button
              type="button"
              onClick={() => onCreateRule({ content: { op: 'equals', value: t.content } }, t.content)}
              className="min-h-11 rounded-lg bg-bg px-3 py-2 text-left text-sm"
            >
              内容が「<b className="break-all">{t.content}</b>」の明細を除外
            </button>
          )}
          {t.institution && (
            <button
              type="button"
              onClick={() => onCreateRule({ institutions: [t.institution], flow: t.amount < 0 ? 'expense' : 'income' }, `${t.institution}の${t.amount < 0 ? '支出' : '収入'}`)}
              className="min-h-11 rounded-lg bg-bg px-3 py-2 text-left text-sm"
            >
              金融機関「<b>{t.institution}</b>」の{t.amount < 0 ? '支出' : '収入'}を除外
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">次の画面で条件を調整し、除外される件数を確認してから保存できます。</p>
      </div>
    </Sheet>
  );
}
