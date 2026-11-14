import { Sheet } from '../../components/Sheet';
import { encodingLabel } from '../../lib/encoding';
import { formatYm } from '../../lib/date';
import { formatCount } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import { countCandidates } from '../../lib/doubleCount';

/** 取り込み中の進捗表示と、取り込み結果の表示 */
export function ImportDialogs() {
  const progress = useAppStore((s) => s.importProgress);
  const summary = useAppStore((s) => s.importSummary);
  const close = useAppStore((s) => s.closeImportSummary);
  const doubleCount = useAppStore((s) => countCandidates(s.doubleCount).total);
  const openDoubleCount = useAppStore((s) => s.openDoubleCount);

  if (progress) {
    const reading = progress.phase === 'read';
    const pct = reading ? Math.round(((progress.current - 1) / progress.total) * 100) : Math.round((progress.current / progress.total) * 100);
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="status" aria-live="polite">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
          {reading ? (
            <>
              <p className="font-bold">
                読み込み中… {progress.current} / {progress.total} ファイル目
              </p>
              <p className="mt-1 truncate text-sm text-muted">{progress.fileName}</p>
            </>
          ) : (
            <>
              <p className="font-bold">保存中…</p>
              <p className="tabular mt-1 text-sm text-muted">
                {formatCount(progress.current)} / {formatCount(progress.total)}
              </p>
            </>
          )}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">完了するまでこの画面のままお待ちください。</p>
        </div>
      </div>
    );
  }

  if (!summary) return null;
  const ok = summary.files.filter((f) => f.ok);
  const warned = ok.filter((f) => f.rowErrors.length > 0);
  return (
    <Sheet
      open
      title="取り込み結果"
      onClose={close}
      footer={
        <button type="button" onClick={close} className="h-12 w-full rounded-xl bg-accent font-bold text-on-accent">
          OK
        </button>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="成功ファイル" value={`${ok.length}/${summary.files.length}`} />
        <Stat label="新規の明細" value={formatCount(summary.added)} />
        <Stat label="重複（上書き）" value={formatCount(summary.updated)} />
      </dl>
      {summary.newDoubleCount > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn-ink">
          <p className="font-bold">
            <span aria-hidden="true">⚠ </span>二重計上の候補が新しく<span className="tabular">{summary.newDoubleCount}</span>件見つかりました
            {doubleCount > summary.newDoubleCount && (
              <span className="block text-xs font-normal">
                （確認していない候補は全部で<span className="tabular">{doubleCount}</span>件）
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              // 取り込み結果を閉じてから、候補の一覧を開く（シートを重ねない）
              close();
              openDoubleCount();
            }}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-3 font-bold text-on-accent"
          >
            確認する
          </button>
        </div>
      )}
      {summary.updated > 0 && (
        <p className="mt-3 text-xs text-muted">同じIDの明細は最新の内容で上書きしたため、二重には計上されません。</p>
      )}

      {summary.failed.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-bold text-danger">取り込めなかったファイル（{summary.failed.length}件）</h3>
          <ul className="mt-2 space-y-2">
            {summary.failed.map((f) => (
              <li key={f.fileName} className="rounded-lg bg-danger-soft p-3 text-sm">
                <p className="font-medium break-all">{f.fileName}</p>
                <p className="mt-1 text-danger">{f.error}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {warned.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-bold text-warn-ink">一部の行を読み飛ばしたファイル</h3>
          <ul className="mt-2 space-y-2">
            {warned.map((f) => (
              <li key={f.fileName} className="rounded-lg bg-warn-soft p-3 text-sm">
                <p className="font-medium break-all">{f.fileName}</p>
                <ul className="mt-1 list-disc pl-5 text-warn-ink">
                  {f.rowErrors.slice(0, 5).map((e) => (
                    <li key={e.line}>
                      {e.line}行目: {e.message}
                    </li>
                  ))}
                  {f.rowErrors.length > 5 && <li>ほか {f.rowErrors.length - 5} 行</li>}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="tabular mt-4 text-xs text-muted">
        かかった時間：読み込み {sec(summary.timing.read)}・保存 {sec(summary.timing.save)}・表示の更新 {sec(summary.timing.finish)}
      </p>

      {ok.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-muted">ファイルごとの内訳</summary>
          <ul className="divide-y divide-line">
            {ok.map((f) => (
              <li key={f.fileName} className="py-2">
                <p className="break-all">{f.fileName}</p>
                <p className="text-xs text-muted">
                  {f.months.map(formatYm).join('・')} / {formatCount(f.rowCount)}（新規 {f.added}・上書き {f.updated}）/{' '}
                  {f.encoding && encodingLabel(f.encoding)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Sheet>
  );
}

function sec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}秒`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-1 font-bold">{value}</dd>
    </div>
  );
}
