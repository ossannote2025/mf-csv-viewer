/** 端末・表示のしかたの判定（ブラウザの情報を引数で受け取れるようにして、テストできるようにする） */

interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}

/** iPhone・iPad か（iPadOS の Safari は Mac と同じ userAgent なので、タッチ点の数で見分ける） */
export function isIosDevice(nav: NavigatorLike = navigator): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/** ホーム画面から開いたアプリ（PWA）か */
export function isStandalone(win: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window, nav: NavigatorLike = navigator): boolean {
  return win?.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

/** 「ホーム画面に追加」の案内を出すか（iPhone・iPad のブラウザで開いているときだけ。0.11.1） */
export function shouldShowInstallHint(win?: Pick<Window, 'matchMedia'>, nav: NavigatorLike = navigator): boolean {
  return isIosDevice(nav) && !isStandalone(win ?? (typeof window === 'undefined' ? undefined : window), nav);
}
