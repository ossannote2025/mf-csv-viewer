/**
 * ファイルを端末に保存する。
 * iPhoneなどのタッチ端末では共有シート（「"ファイル"に保存」でiCloud Driveへ）、それ以外はダウンロード。
 * 共有シートはタップ直後に呼ぶ必要があるため、呼び出し側はこの関数の前に await を挟まないこと。
 */
export async function saveFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // 共有できない場合はダウンロードに切り替える
    }
  }
  downloadFile(file);
  return 'downloaded';
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
