import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon } from '../../components/Icons';
import { useAppStore } from '../../store/useAppStore';

/** CSVの取り込み（ファイル選択＋ドラッグ&ドロップ） */
export function ImportPanel({ compact }: { compact?: boolean }) {
  const importFiles = useAppStore((s) => s.importFiles);
  const progress = useAppStore((s) => s.importProgress);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter((f) => /\.(csv|txt)$/i.test(f.name) || f.type.includes('csv') || f.type === '');
    void importFiles(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${dragging ? 'border-accent bg-accent-soft' : 'border-line'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={!!progress}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-50"
      >
        <UploadIcon className="size-5" />
        CSVファイルを選ぶ
      </button>
      {!compact && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          複数ファイルをまとめて選べます（10年分・120ファイルでもOK）。
          <br className="hidden sm:inline" />
          PCではここにファイルをドラッグ&ドロップできます。
        </p>
      )}
    </div>
  );
}
