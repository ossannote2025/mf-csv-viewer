import { useEffect, useRef, type ReactNode } from 'react';
import type { MonthInfo } from '../lib/aggregate';
import { detectSwipe, monthAfterSwipe, SWIPE_EDGE } from '../lib/swipe';

/** ホーム画面から開いた PWA か（PWA には画面端の「戻る」ジェスチャーがない） */
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** タッチの開始位置が横スクロールできる要素の中か（その中の横スワイプはスクロールに使う） */
function inHorizontalScroller(target: EventTarget | null, root: HTMLElement) {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/**
 * 左右スワイプで前後の月に移動する範囲。months は新しい順。
 * 月が変わったときは、内容を移動の向きに少しスライドさせて切り替わったことを示す。
 */
export function MonthSwipeArea({
  months,
  value,
  onChange,
  disabled = false,
  children,
}: {
  months: MonthInfo[];
  value: string;
  onChange: (ym: string) => void;
  /** true のあいだはスワイプに反応しない（期間指定の表示中など） */
  disabled?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ months, value, onChange, disabled });
  useEffect(() => {
    latest.current = { months, value, onChange, disabled };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      start = null;
      if (latest.current.disabled || e.touches.length !== 1 || inHorizontalScroller(e.target, el)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) start = null; // ピンチなどは対象外
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      // PWA では画面端から始まるスワイプも使える。Safari では端は「戻る／進む」に任せる
      const dir = detectSwipe(start, { x: t.clientX, y: t.clientY }, { edge: isStandalone() ? 0 : SWIPE_EDGE, viewportWidth: window.innerWidth });
      start = null;
      if (!dir) return;
      const { months, value, onChange } = latest.current;
      const next = monthAfterSwipe(months, value, dir);
      if (next) onChange(next);
    };
    const onCancel = () => {
      start = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, []);

  // 月が変わったら（スワイプ・矢印・一覧のどれでも）短くスライドさせる
  const prevValue = useRef(value);
  useEffect(() => {
    const before = prevValue.current;
    prevValue.current = value;
    const el = ref.current;
    if (before === value || !el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const from = value > before ? 24 : -24; // 新しい月は右から、古い月は左から入る
    el.animate(
      [
        { transform: `translateX(${from}px)`, opacity: 0.4 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 200, easing: 'ease-out' },
    );
  }, [value]);

  // スライド中に横スクロールが出ないよう、外側で横方向だけ切り取る
  return (
    <div className="overflow-x-clip">
      <div ref={ref}>{children}</div>
    </div>
  );
}
