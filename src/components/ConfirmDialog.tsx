import { useState, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** 入力を求める確認語（全データ削除など重大な操作用） */
  requireText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, requireText, onConfirm, onCancel }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const canConfirm = !busy && (!requireText || text.trim() === requireText);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted">{message}</div>
        {requireText && (
          <label className="mt-4 block text-sm">
            確認のため「<b className="text-ink">{requireText}</b>」と入力してください
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              autoComplete="off"
            />
          </label>
        )}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="h-11 flex-1 rounded-lg border border-line font-medium">
            キャンセル
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                setText('');
              }
            }}
            className={`h-11 flex-1 rounded-lg font-bold disabled:opacity-40 ${danger ? 'bg-danger text-white' : 'bg-accent text-on-accent'}`}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
