import { useEffect } from 'react';

/** キーボードや選択リストを出す要素か */
function isFormField(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

/**
 * iPhone の Safari（特にホーム画面に追加したアプリ）では、キーボードや月の選択（select）の
 * 回転式リストを閉じたあと、画面の高さが縮んだまま残り、下に固定したメニューが上に浮くことがある。
 * 閉じたあと・アプリに戻ったときに、今のスクロール位置のまま scrollTo を呼んで位置を計算し直させる。
 */
export function useViewportFix() {
  useEffect(() => {
    let timers: number[] = [];
    const relayout = () => {
      timers.forEach((t) => window.clearTimeout(t));
      // 閉じるアニメーションが終わる前後で数回やり直す
      timers = [0, 150, 400].map((ms) =>
        window.setTimeout(() => {
          if (isFormField(document.activeElement)) return; // 入力中は触らない
          window.scrollTo(window.scrollX, window.scrollY);
        }, ms),
      );
    };

    const onFocusOut = (e: FocusEvent) => {
      if (isFormField(e.target)) relayout();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') relayout();
    };
    const vv = window.visualViewport;
    let lastHeight = vv?.height ?? 0;
    const onViewportResize = () => {
      if (!vv) return;
      // 高さが元に戻った（大きくなった）ときだけ
      if (vv.height > lastHeight) relayout();
      lastHeight = vv.height;
    };

    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', relayout);
    vv?.addEventListener('resize', onViewportResize);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', relayout);
      vv?.removeEventListener('resize', onViewportResize);
    };
  }, []);
}
