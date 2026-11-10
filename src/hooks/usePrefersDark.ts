import { useSyncExternalStore } from 'react';

const query = '(prefers-color-scheme: dark)';

function subscribe(cb: () => void) {
  const mql = window.matchMedia?.(query);
  mql?.addEventListener('change', cb);
  return () => mql?.removeEventListener('change', cb);
}

/** 端末がダークモードかどうか（iPhoneの外観モードの切り替えにも追従する） */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
