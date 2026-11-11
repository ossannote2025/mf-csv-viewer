/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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

export default defineConfig({
  base: '/mf-csv-viewer/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
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
    include: ['src/**/*.test.ts'],
  },
});
