// ビルド後のCSSに、コードから参照している色の変数（var(--color-...)）がすべて定義されているか確認する。
// Tailwind はクラス名で使われていない変数を省くことがあり、グラフの色が消える不具合の再発を防ぐ。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

const used = new Set();
for (const f of walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/var\(--(color-[a-z0-9-]*[a-z0-9])\b(?!-)/g)) used.add(m[1]);
  // `var(--color-chart-${i})` のようなテンプレートは 1〜7 に展開して確認する
  if (src.includes('var(--color-chart-${i})')) for (let i = 1; i <= 7; i++) used.add(`color-chart-${i}`);
}

const css = walk('dist/assets').filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
// ライトモード（:root の既定値）に定義があるかを確認する。ダークモードの定義だけでは不十分
const lightCss = css.replace(/@media \(prefers-color-scheme:\s*dark\)\{[\s\S]*?\}\}/g, '');
const missing = [...used].filter((v) => !new RegExp(`--${v}:`).test(lightCss));
if (missing.length) {
  console.error('ビルド後のCSSに定義がない色の変数があります（ライトモード）:');
  for (const v of missing) console.error(`  - --${v}`);
  process.exit(1);
}
console.log(`OK: コードから参照している色の変数 ${used.size} 個がすべて定義されています`);
