import { describe, expect, it } from 'vitest';
import { hasFinePointer, isIosDevice, isStandalone, shouldShowInstallHint } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const media = (standalone: boolean) => ({ matchMedia: ((q: string) => ({ matches: standalone && q.includes('standalone') })) as unknown as Window['matchMedia'] });

describe('isIosDevice', () => {
  it('iPhone と、Mac と同じ userAgent の iPad（タッチあり）を iOS とする', () => {
    expect(isIosDevice({ userAgent: IPHONE })).toBe(true);
    expect(isIosDevice({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
  });
  it('Mac（タッチなし）・Android は iOS としない', () => {
    expect(isIosDevice({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isIosDevice({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('isStandalone', () => {
  it('display-mode が standalone、または navigator.standalone なら true', () => {
    expect(isStandalone(media(true), { userAgent: IPHONE })).toBe(true);
    expect(isStandalone(media(false), { userAgent: IPHONE, standalone: true })).toBe(true);
    expect(isStandalone(media(false), { userAgent: IPHONE })).toBe(false);
  });
});

describe('shouldShowInstallHint（ホーム画面に追加の案内）', () => {
  it('iPhone・iPad のブラウザで開いているときだけ出す', () => {
    expect(shouldShowInstallHint(media(false), { userAgent: IPHONE })).toBe(true);
    expect(shouldShowInstallHint(media(false), { userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
  });
  it('ホーム画面のアプリ・PC・Android では出さない', () => {
    expect(shouldShowInstallHint(media(true), { userAgent: IPHONE })).toBe(false);
    expect(shouldShowInstallHint(media(false), { userAgent: IPHONE, standalone: true })).toBe(false);
    expect(shouldShowInstallHint(media(false), { userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(shouldShowInstallHint(media(false), { userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('hasFinePointer（ドラッグ&ドロップの案内）', () => {
  const pointer = (fine: boolean) => ({ matchMedia: ((q: string) => ({ matches: fine && q === '(pointer: fine)' })) as unknown as Window['matchMedia'] });
  it('マウスのある端末だけ true、タッチ端末・matchMedia がない環境では false', () => {
    expect(hasFinePointer(pointer(true))).toBe(true);
    expect(hasFinePointer(pointer(false))).toBe(false);
    expect(hasFinePointer({} as Pick<Window, 'matchMedia'>)).toBe(false);
  });
});
