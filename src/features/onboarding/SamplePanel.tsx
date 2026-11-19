import { useEffect, useState } from 'react';
import { ChevronDown, DownloadIcon, FlaskIcon } from '../../components/Icons';
import { formatYm } from '../../lib/date';
import { fetchSampleFiles, SAMPLE_FILES, SAMPLE_PERIOD } from '../../lib/sample';
import { saveFiles } from '../../lib/saveFile';
import { useAppStore } from '../../store/useAppStore';

/**
 * サンプル（架空の家計）の CSV で試す。
 * iPhone の共有シートはタップ直後に呼ぶ必要があるので、ファイルは画面を出した時点で先に読んでおく。
 */
export function SamplePanel({ onImport }: { onImport?: () => void }) {
  const importFiles = useAppStore((s) => s.importFiles);
  const busy = useAppStore((s) => !!s.importProgress);
  const [files, setFiles] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSampleFiles(import.meta.env.BASE_URL)
      .then((f) => alive && setFiles(f))
      .catch(() => alive && setError('サンプルを読み込めませんでした。インターネットにつながっているときに、もう一度開いてください。'));
    return () => {
      alive = false;
    };
  }, []);

  const ready = !!files && !busy;
  return (
    <div className="text-sm leading-relaxed">
      <p className="text-muted">
        架空の家計（{formatYm(SAMPLE_PERIOD.from)}〜{formatYm(SAMPLE_PERIOD.to)}）の CSV です。店名・金融機関名はすべて架空です。
      </p>
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          if (!files) return;
          void importFiles(files);
          onImport?.();
        }}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-accent font-bold text-accent disabled:opacity-50"
      >
        <FlaskIcon className="size-5" />
        サンプルをそのまま取り込む
      </button>
      {!files && !error && <p className="mt-2 text-xs text-muted">準備しています…</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <details className="group mt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
          ファイルから取り込む手順も試す
          <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (!files) return;
            // 共有シートのため、ここで await を挟まない
            void saveFiles(files).then((r) => setNote(r === 'downloaded' ? 'ダウンロードしました。' : r === 'shared' ? '保存しました。' : null));
          }}
          className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line font-medium disabled:opacity-50"
        >
          <DownloadIcon className="size-5" />
          CSVを保存（{SAMPLE_FILES.length}ファイル）
        </button>
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>
            「CSVを保存」では1年分ずつのファイルを保存します（iPhone では共有シートの「"ファイル"に保存」）。保存したファイルを「CSVファイルを選ぶ」から取り込むと、実際の使い方と同じ手順を試せます。
          </li>
          <li>試したあとは、設定タブの「データの削除」→「サンプルの明細だけを削除」で消せます。</li>
        </ul>
      </details>
    </div>
  );
}
