import type { RuleConditions, Transaction } from '../../lib/types';

/** 明細の内容・金融機関から除外ルールを作るボタン */
export function CreateRuleButtons({ t, onCreateRule }: { t: Transaction; onCreateRule: (cond: RuleConditions, name: string) => void }) {
  const flowLabel = t.amount < 0 ? '支出' : '収入';
  return (
    <div>
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
            onClick={() => onCreateRule({ institutions: [t.institution], flow: t.amount < 0 ? 'expense' : 'income' }, `${t.institution}の${flowLabel}`)}
            className="min-h-11 rounded-lg bg-bg px-3 py-2 text-left text-sm"
          >
            金融機関「<b>{t.institution}</b>」の{flowLabel}を除外
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">次の画面で条件を調整し、除外される件数を確認してから保存できます。</p>
    </div>
  );
}
