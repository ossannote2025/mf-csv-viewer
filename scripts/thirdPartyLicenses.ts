/**
 * アプリに同梱する（ビルド結果に入る）ライブラリのライセンス文を集める。
 * ビルドのときに手元のファイル（package-lock.json と node_modules）を読むだけで、外部とは通信しない。
 * vite.config.ts の licensesPlugin から使う。
 */
import fs from 'node:fs';
import path from 'node:path';

export interface ThirdPartyLicense {
  name: string;
  version: string;
  /** SPDX の式（package.json の license） */
  license: string;
  /** LICENSE ファイルの全文 */
  text: string;
}

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  devOptional?: boolean;
}

interface LockFile {
  packages: Record<string, LockPackage>;
}

/**
 * package-lock.json に「開発用」とあっても、ビルド結果に入るパッケージ。
 * - workbox-*：vite-plugin-pwa が作るサービスワーカー（sw.js・workbox-*.js）と更新の案内
 * - tailwindcss：生成される CSS
 */
export const BUNDLED_DEV_PACKAGES = [
  'tailwindcss',
  'workbox-core',
  'workbox-precaching',
  'workbox-routing',
  'workbox-strategies',
  'workbox-window',
];

/** node_modules のパスからパッケージ名を取り出す（入れ子なら一番内側） */
export function packageNameFromPath(p: string): string | null {
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('node_modules/');
  if (i < 0) return null;
  const parts = norm.slice(i + 'node_modules/'.length).split('/');
  if (!parts[0]) return null;
  if (parts[0].startsWith('@')) return parts[1] ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

export interface SelectedPackage {
  name: string;
  /** package-lock.json のキー（node_modules/...） */
  dir: string;
  version: string;
  license: string;
}

/** 本番用のパッケージ（＋ビルド結果に入る開発用のもの）を選ぶ。同じ名前・バージョンは1つにする */
export function selectPackages(lock: LockFile, extras: string[] = BUNDLED_DEV_PACKAGES): SelectedPackage[] {
  const seen = new Map<string, SelectedPackage>();
  for (const [dir, pkg] of Object.entries(lock.packages)) {
    const name = packageNameFromPath(dir);
    if (!name) continue;
    if ((pkg.dev || pkg.devOptional) && !extras.includes(name)) continue;
    if (name.startsWith('@types/')) continue;
    const version = pkg.version ?? '';
    const key = `${name}@${version}`;
    if (!seen.has(key)) seen.set(key, { name, dir, version, license: pkg.license ?? '' });
  }
  return [...seen.values()].sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

/** ディレクトリのファイル名から LICENSE ファイルを選ぶ（LICENSE → LICENCE → COPYING の順。拡張子は問わない） */
export function findLicenseFile(files: string[]): string | null {
  for (const base of ['license', 'licence', 'copying']) {
    const hit = files.filter((f) => f.toLowerCase().split('.')[0] === base).sort((a, b) => a.length - b.length)[0];
    if (hit) return hit;
  }
  return null;
}

/** 型定義だけのパッケージ（JavaScript を含まないので、ビルド結果に入らない） */
export function isTypesOnly(pkgJson: Record<string, unknown>): boolean {
  return !pkgJson.main && !pkgJson.module && !pkgJson.exports && !pkgJson.browser && Boolean(pkgJson.types || pkgJson.typings);
}

/** root（リポジトリ）の package-lock.json と node_modules から、同梱ライブラリのライセンスを集める */
export function collectThirdPartyLicenses(root: string): ThirdPartyLicense[] {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')) as LockFile;
  const result: ThirdPartyLicense[] = [];
  for (const pkg of selectPackages(lock)) {
    const dir = path.join(root, pkg.dir);
    if (!fs.existsSync(dir)) continue; // 別の OS 用の optional パッケージなど
    const pkgJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    if (isTypesOnly(pkgJson)) continue;
    const file = findLicenseFile(fs.readdirSync(dir));
    if (!file) throw new Error(`${pkg.name}@${pkg.version} のライセンスファイルが見つかりません`);
    const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim();
    result.push({ name: pkg.name, version: pkg.version, license: pkg.license || String(pkgJson.license ?? ''), text });
  }
  return result;
}

/** dist に置くテキストファイルの中身 */
export function formatLicensesText(appLicense: string, libs: ThirdPartyLicense[]): string {
  const rule = '='.repeat(72);
  const parts = [
    'mf-csv-viewer',
    '',
    appLicense.trim(),
    '',
    rule,
    'このアプリに同梱しているライブラリのライセンス',
    'Licenses of third-party libraries bundled in this app',
    rule,
  ];
  for (const lib of libs) {
    parts.push('', `${lib.name}@${lib.version} (${lib.license})`, '-'.repeat(72), lib.text, '');
  }
  return parts.join('\n') + '\n';
}
