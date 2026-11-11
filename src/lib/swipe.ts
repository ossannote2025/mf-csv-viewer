/** 左右スワイプの判定（純粋関数）。月の切り替えに使う */

export type SwipeDirection = 'left' | 'right';

export interface SwipeOptions {
  /** 横に何 px 以上動いたらスワイプとみなすか */
  minDistance?: number;
  /** 横の移動が縦の移動の何倍以上ならスワイプとみなすか */
  ratio?: number;
  /** 画面の左右端から何 px 以内で始まったタッチを無視するか（Safari の「戻る／進む」ジェスチャーと重ならないように） */
  edge?: number;
  /** 画面の幅（edge の判定に使う） */
  viewportWidth?: number;
}

export const SWIPE_MIN_DISTANCE = 60;
export const SWIPE_RATIO = 1.5;
export const SWIPE_EDGE = 20;

/**
 * タッチの開始点と終了点から、左右どちらへのスワイプかを返す。スワイプでなければ null。
 * 縦スクロール中に月が変わらないよう、横の動きがはっきり大きいときだけ反応する。
 */
export function detectSwipe(
  start: { x: number; y: number },
  end: { x: number; y: number },
  { minDistance = SWIPE_MIN_DISTANCE, ratio = SWIPE_RATIO, edge = 0, viewportWidth = Infinity }: SwipeOptions = {},
): SwipeDirection | null {
  if (edge > 0 && (start.x < edge || start.x > viewportWidth - edge)) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < minDistance) return null;
  if (Math.abs(dx) < Math.abs(dy) * ratio) return null;
  return dx < 0 ? 'left' : 'right';
}

/**
 * スワイプの向きから移動先の月を返す（months は新しい順）。
 * 左へスワイプ → 次の月（新しい月）、右へスワイプ → 前の月（古い月）。端の月では null。
 */
export function monthAfterSwipe(months: readonly { ym: string }[], current: string, dir: SwipeDirection): string | null {
  const idx = months.findIndex((m) => m.ym === current);
  if (idx < 0) return null;
  const next = dir === 'left' ? idx - 1 : idx + 1;
  return months[next]?.ym ?? null;
}
