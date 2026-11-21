import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';

type Licenses = typeof import('virtual:third-party-licenses');

const REPO_URL = 'https://github.com/ossannote2025/mf-csv-viewer';

/** ライセンス（このアプリの MIT と、同梱ライブラリのライセンス文）。一覧は開いたときに読む */
export function LicenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<Licenses | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    let alive = true;
    import('virtual:third-party-licenses')
      .then((m) => alive && setData(m))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, data]);

  return (
    <Sheet open={open} title="ライセンス" onClose={onClose}>
      <h3 className="text-sm font-bold">このアプリ</h3>
      <p className="mt-1 text-sm leading-relaxed">
        MIT ライセンスで公開しています。ソースコードは{' '}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
          GitHub
        </a>
        にあります。
      </p>
      {data && <LicenseText text={data.appLicense} />}

      <h3 className="mt-5 text-sm font-bold">使用しているライブラリ</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">このアプリに含まれているライブラリと、それぞれのライセンスです。名前をタップすると全文を表示します。</p>
      {failed && <p className="mt-2 text-sm text-danger">読み込めませんでした。通信できる状態で、もう一度開いてください。</p>}
      {!data && !failed && <p className="mt-2 text-sm text-muted">読み込み中…</p>}
      {data && (
        <ul className="mt-2 border-t border-line">
          {data.libraries.map((lib) => (
            <li key={`${lib.name}@${lib.version}`} className="border-b border-line">
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1 text-sm">
                  <span className="min-w-0 break-all">
                    {lib.name} <span className="text-muted">{lib.version}</span>
                  </span>
                  <span className="max-w-[40%] shrink-0 text-right text-xs text-muted">{lib.license}</span>
                </summary>
                <LicenseText text={lib.text} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function LicenseText({ text }: { text: string }) {
  return <pre className="my-2 overflow-x-hidden rounded-lg bg-bg p-3 font-sans text-xs leading-relaxed break-words whitespace-pre-wrap">{text}</pre>;
}
