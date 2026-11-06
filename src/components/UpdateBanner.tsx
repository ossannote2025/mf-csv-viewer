import { useRegisterSW } from 'virtual:pwa-register/react';

/** 新しいバージョンが配信されたときの案内 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // 開きっぱなしでも1時間ごとに更新を確認する
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 px-4 pb-2" role="status">
      <div className="mx-auto flex max-w-lg items-center gap-2 rounded-xl bg-ink p-3 text-sm text-white shadow-lg">
        <p className="flex-1">新しいバージョンがあります</p>
        <button type="button" onClick={() => setNeedRefresh(false)} className="h-11 px-2 text-zinc-300">
          あとで
        </button>
        <button type="button" onClick={() => void updateServiceWorker(true)} className="h-11 rounded-lg bg-accent px-4 font-bold">
          更新
        </button>
      </div>
    </div>
  );
}
