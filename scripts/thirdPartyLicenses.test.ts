import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectThirdPartyLicenses,
  findLicenseFile,
  formatLicensesText,
  isTypesOnly,
  packageNameFromPath,
  selectPackages,
} from './thirdPartyLicenses';

describe('packageNameFromPath', () => {
  it('ふつうの名前・スコープ付き・入れ子', () => {
    expect(packageNameFromPath('node_modules/react')).toBe('react');
    expect(packageNameFromPath('node_modules/@tanstack/react-virtual')).toBe('@tanstack/react-virtual');
    expect(packageNameFromPath('node_modules/a/node_modules/b')).toBe('b');
    expect(packageNameFromPath('/repo/node_modules/@scope/pkg/dist/index.js')).toBe('@scope/pkg');
    expect(packageNameFromPath('C:\\repo\\node_modules\\dexie\\dist\\dexie.mjs')).toBe('dexie');
  });

  it('node_modules の外は null', () => {
    expect(packageNameFromPath('')).toBeNull();
    expect(packageNameFromPath('/repo/src/main.tsx')).toBeNull();
  });
});

describe('selectPackages', () => {
  const lock = {
    packages: {
      '': { version: '1.0.0' },
      'node_modules/lib-a': { version: '1.0.0', license: 'MIT' },
      'node_modules/dev-tool': { version: '2.0.0', license: 'MIT', dev: true },
      'node_modules/workbox-core': { version: '7.0.0', license: 'MIT', dev: true },
      'node_modules/opt-dev': { version: '1.0.0', license: 'MIT', devOptional: true },
      'node_modules/@types/x': { version: '1.0.0', license: 'MIT' },
      'node_modules/@scope/lib-b': { version: '3.0.0', license: 'Apache-2.0' },
      'node_modules/x/node_modules/lib-a': { version: '1.0.0', license: 'MIT' },
      'node_modules/y/node_modules/lib-a': { version: '0.9.0', license: 'MIT' },
    },
  };

  it('本番用と、ビルド結果に入る開発用だけを選ぶ（型定義と同じバージョンの重複は除く）', () => {
    const got = selectPackages(lock, ['workbox-core']).map((p) => `${p.name}@${p.version}`);
    expect(got).toEqual(['@scope/lib-b@3.0.0', 'lib-a@0.9.0', 'lib-a@1.0.0', 'workbox-core@7.0.0']);
  });
});

describe('findLicenseFile', () => {
  it('LICENSE を優先し、拡張子・大文字小文字は問わない', () => {
    expect(findLicenseFile(['README.md', 'LICENSE', 'LICENSE-MIT.txt'])).toBe('LICENSE');
    expect(findLicenseFile(['index.js', 'license'])).toBe('license');
    expect(findLicenseFile(['LICENCE.md'])).toBe('LICENCE.md');
    expect(findLicenseFile(['LICENSE.txt', 'COPYING'])).toBe('LICENSE.txt');
    expect(findLicenseFile(['COPYING'])).toBe('COPYING');
    expect(findLicenseFile(['README.md', 'licenses-plugin.js'])).toBeNull();
  });
});

describe('isTypesOnly', () => {
  it('JavaScript の入口がなく型定義だけ', () => {
    expect(isTypesOnly({ main: '', types: 'index.d.ts' })).toBe(true);
    expect(isTypesOnly({ main: './dist/index.js', types: './dist/index.d.ts' })).toBe(false);
    expect(isTypesOnly({ exports: { '.': './index.js' } })).toBe(false);
    expect(isTypesOnly({})).toBe(false);
  });
});

describe('formatLicensesText', () => {
  it('アプリのライセンスのあとに各ライブラリを並べる', () => {
    const text = formatLicensesText('MIT License\n\nCopyright (c) 2026 me\n', [
      { name: 'lib-a', version: '1.0.0', license: 'MIT', text: 'Copyright A' },
    ]);
    expect(text.startsWith('mf-csv-viewer\n\nMIT License')).toBe(true);
    expect(text).toContain('lib-a@1.0.0 (MIT)');
    expect(text).toContain('Copyright A');
  });
});

describe('collectThirdPartyLicenses（このリポジトリの依存）', () => {
  const libs = collectThirdPartyLicenses(path.resolve(__dirname, '..'));
  const byName = new Map(libs.map((l) => [l.name, l]));

  it('アプリに同梱する主なライブラリがすべて入っている', () => {
    for (const name of ['react', 'react-dom', 'scheduler', 'dexie', 'papaparse', 'recharts', 'zustand', '@tanstack/react-virtual', 'd3-shape', 'workbox-window', 'workbox-precaching', 'tailwindcss']) {
      expect(byName.has(name), name).toBe(true);
    }
  });

  it('開発用のツール・型定義だけのパッケージは入らない', () => {
    for (const name of ['vite', 'vitest', 'eslint', 'typescript', '@types/react', 'csstype']) {
      expect(byName.has(name), name).toBe(false);
    }
  });

  it('Apache-2.0 の Dexie は全文が入っている', () => {
    const dexie = byName.get('dexie')!;
    expect(dexie.license).toBe('Apache-2.0');
    expect(dexie.text).toContain('Apache License');
    expect(dexie.text).toContain('END OF TERMS AND CONDITIONS');
  });

  it('どのライブラリにもライセンス文がある', () => {
    for (const lib of libs) expect(lib.text.length, lib.name).toBeGreaterThan(100);
  });
});
