import type { ReactNode } from 'react';

/** 各タブ共通の枠（上部タイトル＋本文、下部タブ分の余白） */
export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-12 items-center justify-between px-4">
          <h1 className="text-lg font-bold">{title}</h1>
          <div className="flex items-center">{actions}</div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mx-4 mt-4 rounded-2xl bg-surface p-4 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-bold text-muted">{title}</h2>}
      {children}
    </section>
  );
}
