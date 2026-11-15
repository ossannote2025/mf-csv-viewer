import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Card, Page } from '../../components/Page';
import { loadRaw, type RawData } from '../../db/repo';
import { backupFileName, createBackup } from '../../lib/backup';
import { formatCount } from '../../lib/format';
import { saveFile } from '../../lib/saveFile';
import { useAppStore } from '../../store/useAppStore';

/** loadRaw が読み出すテーブルの数 */
const RAW_TABLES = 5;

/**
 * 起動時にデータを読み込めなかったときの画面。
 * タブも設定も出せない状態なので、ここだけで「読み込み直す・バックアップを取り出す・全データを消してやり直す」ができるようにする
 */
export function RescueScreen({ message }: { message: string }) {
  const init = useAppStore((s) => s.init);
  const rescueReset = useAppStore((s) => s.rescueReset);
  // undefined：読み出し中、null：読み出せなかった
  const [raw, setRaw] = useState<RawData | null | undefined>(undefined);
  const [retrying, setRetrying] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // 共有シートはタップ直後に呼ぶ必要があるため、書き出すデータは先に読み出しておく
  useEffect(() => {
    let alive = true;
    loadRaw()
      // どのテーブルも読めなかったときは「読み出せなかった」として扱う
      .then((d) => alive && setRaw(d.failed.length >= RAW_TABLES ? null : d))
      .catch(() => alive && setRaw(null));
    return () => {
      alive = false;
    };
  }, []);

  const hasData = !!raw && raw.transactions.length + raw.rules.filter((r) => !r.builtin).length > 0;

  const exportBackup = () => {
    // ここまで await を挟まない（共有シートのため）
    if (!raw) return;
    const now = Date.now();
    const json = JSON.stringify(createBackup(raw.transactions, raw.rules, raw.imports, { lastImportAt: raw.meta.lastImportAt }, raw.dismissed, now));
    const file = new File([json], backupFileName(new Date(now)), { type: 'application/json' });
    setNote(null);
    void saveFile(file).then(
      (r) => r !== 'cancelled' && setNote({ ok: true, text: r === 'shared' ? 'バックアップを書き出しました。' : 'バックアップファイルをダウンロードしました。' }),
      (e) => setNote({ ok: false, text: `書き出しに失敗しました（${e instanceof Error ? e.message : String(e)}）。` }),
    );
  };

  return (
    <Page title="エラー">
      <Card>
        <p className="font-bold text-danger">アプリを開けませんでした</p>
        <p className="mt-2 text-sm leading-relaxed break-words">{message}</p>
        <button
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await init();
            setRetrying(false);
          }}
          className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-on-accent disabled:opacity-40"
        >
          {retrying ? '読み込み中…' : 'もう一度読み込む'}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          一時的な不具合なら、これで直ることがあります。直らないときは、下の手順でデータを取り出してからやり直してください。
        </p>
      </Card>

      <Card title="1. データを取り出す">
        {raw === undefined ? (
          <p className="text-sm text-muted">保存されているデータを確認しています…</p>
        ) : raw === null ? (
          <p className="text-sm leading-relaxed text-muted">保存されているデータを読み出せませんでした。バックアップは書き出せません。</p>
        ) : (
          <>
            <p className="tabular text-sm leading-relaxed">
              明細 <b>{formatCount(raw.transactions.length)}</b>・除外ルール <b>{formatCount(raw.rules.filter((r) => !r.builtin).length)}</b> を読み出せました。
            </p>
            {raw.dropped > 0 && (
              <p className="mt-2 rounded-lg bg-warn-soft p-3 text-xs leading-relaxed text-warn-ink">
                ID・日付・金額が正しくない明細が{formatCount(raw.dropped)}あり、取り出せませんでした（バックアップには入りません）
              </p>
            )}
            {raw.failed.length > 0 && (
              <p className="mt-2 rounded-lg bg-warn-soft p-3 text-xs leading-relaxed text-warn-ink">読み出せなかったもの：{raw.failed.join('、')}（バックアップには入りません）</p>
            )}
          </>
        )}
        <button type="button" disabled={!hasData} onClick={exportBackup} className="mt-3 h-12 w-full rounded-xl bg-accent font-bold text-on-accent disabled:opacity-40">
          バックアップを書き出す
        </button>
        {note && <p className={`mt-2 text-sm ${note.ok ? 'text-income' : 'text-danger'}`} role="status">{note.text}</p>}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          iPhoneでは共有メニューの「"ファイル"に保存」を選ぶと、iCloud Drive に保存できます。バックアップファイルには家計データが含まれるので、人に送ったり公開しないでください。
        </p>
      </Card>

      <Card title="2. データを消してやり直す">
        <button
          type="button"
          onClick={() => {
            setDeleteError('');
            setConfirm(true);
          }}
          className="h-12 w-full rounded-xl border border-danger font-bold text-danger">
          全データ削除
        </button>
        {deleteError && (
          <p className="mt-2 text-sm leading-relaxed break-words text-danger" role="alert">
            {deleteError}
            プライベートブラウズを使っている場合は、通常のタブで開き直してください。それでも直らないときは、iPhoneの「設定」→「アプリ」→「Safari」→「詳細」→「Webサイトデータ」で、このサイトのデータを削除してください。
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          この端末に保存された明細・除外ルール・取り込み履歴をすべて削除して、アプリを最初の状態に戻します。そのあと、設定タブの「バックアップから復元」か、CSVの取り込み直しでデータを戻せます。
        </p>
      </Card>

      <p className="mx-4 mt-4 text-xs text-muted">バージョン {__APP_VERSION__}</p>

      <ConfirmDialog
        open={confirm}
        title="全データを削除しますか？"
        message="この端末に保存された明細と、除外ルールの設定がすべて削除されます。元に戻せません。先にバックアップを書き出しておくことをおすすめします。"
        confirmLabel="すべて削除"
        danger
        requireText="削除"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await rescueReset();
          } catch (e) {
            setDeleteError(`削除に失敗しました（${e instanceof Error ? e.message : String(e)}）。`);
          }
          setConfirm(false);
        }}
      />
    </Page>
  );
}
