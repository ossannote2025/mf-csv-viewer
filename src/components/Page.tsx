import type { ReactNode } from 'react';

/**
 * 各タブ共通の枠（上部の濃紺のヘッダー＋本文、下部タブ分の余白）。
 * sub はヘッダーの帯の中（タイトルの下）に表示する（グラフ・集計の切り替えタブなど）。
 */
export function Page({ title, actions, sub, children }: { title: string; actions?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="pt-safe sticky top-0 z-30 bg-header text-on-header">
        <div className="flex h-12 items-center justify-between px-4">
          <h1 className="text-lg font-bold">{title}</h1>
          <div className="flex items-center text-on-header/80">{actions}</div>
        </div>
        {sub && <div className="px-4 pb-3">{sub}</div>}
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
