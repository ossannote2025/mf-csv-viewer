import { useState, type ReactNode } from 'react';
import { shouldShowInstallHint } from '../../lib/platform';
import { ChevronDown, LockIcon } from '../../components/Icons';
import { ImportPanel } from '../settings/ImportPanel';
import { SamplePanel } from './SamplePanel';

/**
 * データ未取り込み時の案内（0.11.2 で並べ替え）
 * ホーム画面に追加の案内 → CSVの入手方法 → CSVファイルを選ぶ → サンプルで試す → プライバシー
 */
export function Onboarding() {
  const [showInstallHint] = useState(() => shouldShowInstallHint());
  return (
    <div className="px-4 py-6">
      <h2 className="text-xl font-bold">はじめに CSV を取り込みましょう</h2>
      <p className="mt-2 text-sm text-muted">マネーフォワードMEの「収入・支出詳細」CSVを読み込むと、明細の検索や集計ができます。</p>

      {showInstallHint && <InstallHint />}

      <details open className="group mt-5 rounded-xl border border-line bg-surface px-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 font-bold [&::-webkit-details-marker]:hidden">
          CSVの入手方法
          <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <ol className="space-y-4 pb-4 text-sm leading-relaxed">
          <Step n={1} title="CSVをダウンロード">
            マネーフォワードMEのWeb版にログイン →「家計簿」→「収入・支出詳細」→ 月を選んで「ダウンロード」→「CSVファイル」。月ごとに1ファイルずつ保存します。
            <br />
            iPhoneアプリからダウンロードした年ごとのCSV（1ファイル＝1年分）も、そのまま取り込めます。
          </Step>
          <Step n={2} title="iPhoneに移す">PCで保存したCSVは iCloud Drive などに入れると、iPhoneの「ファイル」アプリから選べます。</Step>
          <Step n={3} title="取り込む">
            下の「CSVファイルを選ぶ」→「ファイル」アプリでCSVを選択（複数選択できます）。同じ明細を何度取り込んでも二重にはなりません。
          </Step>
        </ol>
      </details>

      <div className="mt-5">
        <ImportPanel />
      </div>

      <section className="mt-5 rounded-xl border border-line bg-surface p-4">
        <h3 className="font-bold">まずはサンプルで試す</h3>
        <p className="mt-1 text-sm text-muted">自分のデータを入れる前に、架空のデータでどんなことができるかを確かめられます。</p>
        <div className="mt-3">
          <SamplePanel />
        </div>
      </section>

      <div className="mt-6 flex gap-3 rounded-xl bg-accent-soft p-4 text-sm leading-relaxed">
        <LockIcon className="size-6 shrink-0 text-accent" />
        <p>データはこの端末のブラウザ内だけに保存され、外部のサーバーには一切送信されません。</p>
      </div>
    </div>
  );
}

/** iPhone・iPad のブラウザで開いているときの「ホーム画面に追加」の案内（0.11.1） */
function InstallHint() {
  return (
    <section className="mt-5 rounded-xl bg-accent-soft p-4 text-sm leading-relaxed" aria-label="ホーム画面に追加">
      <h3 className="font-bold">ホーム画面に追加してから使うのがおすすめ</h3>
      <p className="mt-1">
        ホーム画面に追加したアプリと Safari では、<b>データの保存場所が別</b>です。先に追加して、ホーム画面のアイコンから開いてから取り込んでください。
        Safariのままだと、しばらく使わないとデータが消えることがあります。
      </p>
      <ol className="mt-3 space-y-2">
        <HintStep n={1}>
          画面下の「<b>…</b>」→「<b>共有</b>」をタップ（共有ボタン（□に↑）が見えていれば、それをタップ）
        </HintStep>
        <HintStep n={2}>
          「<b>ホーム画面に追加</b>」→「<b>追加</b>」（「Webアプリとして開く」が出たら、オンのまま）
        </HintStep>
        <HintStep n={3}>ホーム画面のアイコンから開いて、CSVを取り込む</HintStep>
      </ol>
    </section>
  );
}

/** 案内の番号は、CSVの入手手順（塗りつぶしの丸）と見分けられるよう、小さめの白抜きにする（0.11.2） */
function HintStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-accent bg-surface text-[11px] font-bold text-accent">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">{n}</span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-0.5 text-muted">{children}</p>
      </div>
    </li>
  );
}
