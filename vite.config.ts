/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectThirdPartyLicenses, formatLicensesText, packageNameFromPath } from './scripts/thirdPartyLicenses.ts';

/**
 * 本番ビルドにだけ CSP（Content-Security-Policy）を埋め込む。
 * connect-src 'self' により、万一コードが外部へ通信しようとしてもブラウザが遮断する。
 * （開発サーバーはインラインスクリプトを使うため対象外）
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

/**
 * ライセンスの表示（設定タブ →「ライセンス」）。
 * - virtual:third-party-licenses … このアプリの LICENSE と、同梱ライブラリのライセンス文（画面から遅延読み込み）
 * - ビルド結果に THIRD_PARTY_LICENSES.txt も置く
 * - ビルドに入ったライブラリが一覧から漏れていたら、ビルドを失敗させる
 */
const LICENSES_ID = 'virtual:third-party-licenses';
function licensesPlugin(): Plugin {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const load = () => ({
    app: fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'),
    libs: collectThirdPartyLicenses(root),
  });
  return {
    name: 'third-party-licenses',
    resolveId(id) {
      return id === LICENSES_ID ? '\0' + LICENSES_ID : undefined;
    },
    load(id) {
      if (id !== '\0' + LICENSES_ID) return undefined;
      const { app, libs } = load();
      return `export const appLicense = ${JSON.stringify(app)};\nexport const libraries = ${JSON.stringify(libs)};\n`;
    },
    generateBundle() {
      const { app, libs } = load();
      const listed = new Set(libs.map((l) => l.name));
      const missing = new Set<string>();
      for (const id of this.getModuleIds()) {
        const name = packageNameFromPath(id);
        if (name && !listed.has(name)) missing.add(name);
      }
      if (missing.size) this.error(`ライセンスの一覧にないライブラリがビルドに入っています: ${[...missing].join(', ')}`);
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: formatLicensesText(app, libs) });
    },
  };
}

export default defineConfig({
  base: '/mf-csv-viewer/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    licensesPlugin(),
    VitePWA({
      // 新しいバージョンがあるときは画面に案内を出し、ユーザーが更新する（取り込み中の自動リロードを避ける）
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MF CSV ビューア',
        short_name: 'MF CSV',
        description: 'マネーフォワードMEのCSVをブラウザ内だけで検索・集計するビューア',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1f3a5f',
        background_color: '#f4f4f5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
