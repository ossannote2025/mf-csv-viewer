import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * 長押し（タッチ）と右クリック（PC）を検出する。
 * 長押しが成立したときは、その直後のクリックを無視する。
 */
export function useLongPress(onLongPress: () => void, onClick: () => void, ms = 500) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // マウスは右クリックで
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      // スクロールしたら長押しを取り消す
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      clear();
      if (!fired.current) onLongPress();
      fired.current = true;
    },
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onClick();
    },
  };
}
