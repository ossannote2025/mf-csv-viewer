import type { ComponentType } from 'react';
import { useAppStore, type Tab } from '../store/useAppStore';
import { ChartIcon, GearIcon, ListIcon, SumIcon } from './Icons';

const TABS: { id: Tab; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'transactions', label: '明細', Icon: ListIcon },
  { id: 'charts', label: 'グラフ', Icon: ChartIcon },
  { id: 'summary', label: '集計', Icon: SumIcon },
  { id: 'settings', label: '設定', Icon: GearIcon },
];

export function TabBar() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur" aria-label="メインメニュー">
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map(({ id, label, Icon }) => {
          const active = id === tab;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'font-bold text-accent' : 'text-muted'}`}
              >
                <Icon className="size-6" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
