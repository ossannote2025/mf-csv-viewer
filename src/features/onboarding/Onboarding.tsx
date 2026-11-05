import type { ReactNode } from 'react';
import { LockIcon } from '../../components/Icons';
import { ImportPanel } from '../settings/ImportPanel';

/** データ未取り込み時の案内 */
export function Onboarding() {
  return (
    <div className="px-4 py-6">
      <h2 className="text-xl font-bold">はじめに CSV を取り込みましょう</h2>
      <p className="mt-2 text-sm text-muted">マネーフォワードMEの「収入・支出詳細」CSVを読み込むと、明細の検索や集計ができます。</p>

      <div className="mt-5">
        <ImportPanel />
      </div>

      <ol className="mt-6 space-y-4 text-sm leading-relaxed">
        <Step n={1} title="CSVをダウンロード（PCのブラウザで）">
          マネーフォワードMEのWeb版にログイン →「家計簿」→「収入・支出詳細」→ 月を選んで「ダウンロード」→「CSVファイル」。
          月ごとに1ファイルずつ保存します。
        </Step>
        <Step n={2} title="iPhoneに移す">iCloud Drive などに保存すると、iPhoneの「ファイル」アプリから選べます。</Step>
        <Step n={3} title="取り込む">
          上の「CSVファイルを選ぶ」→「ファイル」アプリでCSVを選択（複数選択できます）。同じ明細を何度取り込んでも二重にはなりません。
        </Step>
      </ol>

      <div className="mt-6 flex gap-3 rounded-xl bg-accent-soft p-4 text-sm leading-relaxed">
        <LockIcon className="size-6 shrink-0 text-accent" />
        <p>
          データはこの端末のブラウザ内だけに保存され、外部のサーバーには一切送信されません。
          <b>ホーム画面に追加したアプリと Safari では保存場所が別</b>なので、普段使う方から取り込んでください。
        </p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{n}</span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-0.5 text-muted">{children}</p>
      </div>
    </li>
  );
}
