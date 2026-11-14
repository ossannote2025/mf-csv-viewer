import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from '../../components/Icons';
import { useMonthData } from '../../hooks/useMonthData';
import { categoryColor } from '../../lib/categoryColors';
import { formatYm } from '../../lib/date';
import { countCandidates } from '../../lib/doubleCount';
import { formatYen } from '../../lib/format';
import { buildMonthlyReport, formatJaDate, formatRatio } from '../../lib/monthlyReport';
import { saveFile } from '../../lib/saveFile';
import type { Change } from '../../lib/series';
import { useAppStore } from '../../store/useAppStore';
import reportCss from './report.css?raw';

/** レポートを開いている間は、アプリ本体（#root）を画面からも印刷からも隠す */
const HIDE_APP_CSS = 'body > #root { display: none !important; }';

/** 'YYYY-MM-DD' → 'M/D（曜）' */
function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const w = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}（${w}）`;
}

/** 増減の表示（白黒でもわかるよう、色ではなく「増・減」の文字で示す） */
function changeLabel(c: Change | null): string {
  if (!c) return 'データなし';
  if (c.diff === 0) return '増減なし';
  const word = c.diff > 0 ? '増' : '減';
  const ratio = c.ratio === null ? '' : `（${c.diff > 0 ? '+' : '-'}${formatRatio(Math.abs(c.ratio))}）`;
  return `${formatYen(Math.abs(c.diff))} ${word}${ratio}`;
}

/** 書き出す HTML ファイル（スクリプトなし・外部の読み込みなしで、このファイルだけで表示できる） */
function buildHtmlFile(title: string, paper: HTMLElement): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
<style>
html, body { margin: 0; background: #ffffff; }
${reportCss}
</style>
</head>
<body>
${paper.outerHTML}
</body>
</html>
`;
}

export function MonthlyPrintReport({ ym }: { ym: string }) {
  const { transactions, byMonth } = useMonthData();
  const excluded = useAppStore((s) => s.excluded);
  const close = useAppStore((s) => s.closeReport);
  const candidates = useAppStore((s) => countCandidates(s.doubleCount, ym).total);
  const oldestYm = transactions[transactions.length - 1]?.ym ?? ym;
  const paperRef = useRef<HTMLElement>(null);
  const [saved, setSaved] = useState('');

  const data = useMemo(() => buildMonthlyReport(byMonth, excluded, ym, oldestYm), [byMonth, excluded, ym, oldestYm]);
  const created = useMemo(() => formatJaDate(new Date()), []);
  const title = `${formatYm(ym)} 支出レポート`;
  const fileTitle = `${formatYm(ym)}_支出レポート`;
  const maxCat = data.categories[0]?.amount ?? 0;

  // 印刷・PDF のファイル名にページのタイトルが使われるため、開いている間だけ変える。先頭から表示し、閉じたら元の位置に戻す
  useLayoutEffect(() => {
    const prevTitle = document.title;
    const prevY = window.scrollY;
    document.title = fileTitle;
    window.scrollTo(0, 0);
    return () => {
      document.title = prevTitle;
      window.scrollTo(0, prevY);
    };
  }, [fileTitle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const saveHtml = () => {
    // 共有シートはタップ直後に呼ぶ必要があるため、ここでは await を挟まずにファイルを作る。
    // ファイル名は英数字にする（日本語の名前は、ブラウザによってダウンロード時に「download」に置き換わることがある）
    if (!paperRef.current) return;
    const file = new File([buildHtmlFile(fileTitle, paperRef.current)], `spending-report-${ym}.html`, { type: 'text/html' });
    void saveFile(file).then((r) => setSaved(r === 'cancelled' ? '' : r === 'shared' ? '共有しました。' : 'ダウンロードしました。'));
  };

  return createPortal(
    <div className="mr-screen min-h-screen bg-bg text-ink">
      <style>{`${reportCss}\n${HIDE_APP_CSS}`}</style>

      <header className="mr-noprint pt-safe sticky top-0 z-30 bg-header text-on-header">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-2 px-2">
          <button type="button" onClick={close} className="flex h-11 items-center gap-0.5 rounded-lg pr-3 pl-1 font-medium">
            <ChevronLeft className="size-5" />
            戻る
          </button>
          <h1 className="truncate text-base font-bold">支出レポート</h1>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-lg bg-on-header px-4 text-sm font-bold text-header-ink">
            印刷する
          </button>
        </div>
      </header>

      <div className="mr-noprint mx-auto max-w-3xl space-y-3 px-4 py-4 text-sm">
        {data.appExpense !== data.total && (
          <p className="rounded-xl bg-warn-soft p-3 text-warn-ink">
            このレポートの支出合計（{formatYen(data.total)}）は、集計タブの支出（{formatYen(data.appExpense)}）と異なります。
            設定で「振替」または「計算対象外」の除外ルールが OFF になっていますが、レポートには振替・計算対象外の明細を載せないためです。
          </p>
        )}
        {candidates > 0 && (
          <p className="rounded-xl bg-warn-soft p-3 text-warn-ink">
            この月に、まだ確認していない二重計上の候補が<span className="tabular">{candidates}</span>件あります。除外していない明細はレポートに載ります。
          </p>
        )}
        <details className="rounded-xl bg-surface p-3 shadow-sm">
          <summary className="min-h-6 cursor-pointer font-bold">印刷・PDF保存のしかた</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>「印刷する」を押すと印刷画面が開きます。用紙は A4 縦です。収入・振替・除外した明細は載りません。</li>
            <li>iPhone で PDF にするとき：印刷画面の右上の共有ボタン →「"ファイル"に保存」。</li>
            <li>パソコンの Chrome で PDF にするとき：送信先を「PDF に保存」にします。「ヘッダーとフッター」はオフがおすすめです。</li>
            <li>印刷画面が開かないとき（ホーム画面から起動したアプリなど）：下の「ファイルとして保存」で保存し、「ファイル」アプリで開いて、共有 →「プリント」から印刷・PDF保存できます。</li>
          </ul>
          <button type="button" onClick={saveHtml} className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-bold text-on-accent">
            ファイルとして保存（HTML）
          </button>
          {saved && <p className="mt-2 text-xs text-muted" role="status">{saved}</p>}
        </details>
      </div>

      <article ref={paperRef} className="mr-paper" aria-label={title}>
        <div className="mr-title">
          <h1>{title}</h1>
          <span className="mr-created">作成日 {created}</span>
        </div>

        <section className="mr-section">
          <div className="mr-total">
            <span className="mr-total-label">支出合計</span>
            <span className="mr-total-value mr-num">{formatYen(data.total)}</span>
          </div>
          <p className="mr-note">{data.count}件。振替・計算対象外・除外した明細は含みません。</p>
          <table className="mr-compact" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>比較</th>
                <th className="mr-num">比較する月の支出</th>
                <th className="mr-num">この月の増減</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: '前月比', c: data.prevMonth },
                { label: '前年同月比', c: data.lastYear },
              ].map((r) => (
                <tr key={r.label}>
                  <th>{r.label}</th>
                  <td className="mr-num">{r.c ? formatYen(data.total - r.c.diff) : '—'}</td>
                  <td className="mr-num">{changeLabel(r.c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mr-section">
          <h2>カテゴリ別の内訳</h2>
          {data.categories.length === 0 ? (
            <p className="mr-empty">この月の支出はありません。</p>
          ) : (
            <table className="mr-compact">
              <thead>
                <tr>
                  <th>大項目</th>
                  <th aria-label="グラフ" />
                  <th className="mr-num">金額</th>
                  <th className="mr-num">割合</th>
                  <th className="mr-num">件数</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.name}>
                    <td className="mr-cat-name">
                      <span className="mr-swatch" style={{ background: categoryColor(c.name) }} />
                      {c.name}
                    </td>
                    <td className="mr-bar-cell" aria-hidden="true">
                      <div className="mr-bar-track">
                        <div className="mr-bar" style={{ width: `${maxCat ? (c.amount / maxCat) * 100 : 0}%`, background: categoryColor(c.name) }} />
                      </div>
                    </td>
                    <td className="mr-num">{formatYen(c.amount)}</td>
                    <td className="mr-num">{formatRatio(c.ratio)}</td>
                    <td className="mr-num">{c.count}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {data.top.length > 0 && (
          <section className="mr-section">
            <h2>大きな支出 トップ{data.top.length}</h2>
            <table className="mr-compact">
              <thead>
                <tr>
                  <th className="mr-col-rank mr-num">順位</th>
                  <th className="mr-col-date">日付</th>
                  <th>内容</th>
                  <th className="mr-col-cat">大項目</th>
                  <th className="mr-col-amount mr-num">金額</th>
                </tr>
              </thead>
              <tbody>
                {data.top.map((r, i) => (
                  <tr key={r.id}>
                    <td className="mr-num">{i + 1}</td>
                    <td className="mr-col-date">{shortDay(r.date)}</td>
                    <td>
                      <div className="mr-clamp">{r.content}</div>
                    </td>
                    <td className="mr-col-cat">{r.large}</td>
                    <td className="mr-num">{formatYen(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {data.rows.length > 0 && (
          <section className="mr-details">
            <h2>明細一覧（{data.rows.length}件・日付順）</h2>
            <table>
              <thead>
                <tr>
                  <th className="mr-col-date">日付</th>
                  <th>内容</th>
                  <th className="mr-col-amount mr-num">金額</th>
                  <th className="mr-col-cat">大項目</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mr-col-date">{shortDay(r.date)}</td>
                    <td>
                      <div className="mr-clamp">{r.content}</div>
                    </td>
                    <td className="mr-num">{formatYen(r.amount)}</td>
                    <td className="mr-col-cat">{r.large}</td>
                  </tr>
                ))}
                <tr className="mr-sumrow">
                  <th colSpan={2}>支出合計</th>
                  <td className="mr-num">{formatYen(data.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </section>
        )}
      </article>
    </div>,
    document.body,
  );
}
