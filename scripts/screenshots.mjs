/**
 * README 用のスクリーンショット（docs/screenshots/*.png）を撮り直す。
 * 実行: npm run screenshots（ビルドしてから、このスクリプトを実行する）
 *
 * - データはこのスクリプトが作る架空の明細だけを使う（店名・金融機関名・金額はすべて作り物）
 * - 架空の CSV はメモリ上だけで作り、ファイルには保存しない（リポジトリには置かない）
 * - Playwright（Chromium）が必要。見つからないときはメッセージを出して終了する
 * - 日本語フォント（Noto Sans CJK JP など）が必要。ないと中国語用のフォントで描かれ、漢字の字形が日本語と違って見える
 *   （例: Ubuntu / Debian なら apt-get install fonts-noto-cjk）
 */
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs/screenshots');
/** 架空データの最後の月（画像を毎回同じにするため固定。変えたいときは引数で指定: node scripts/screenshots.mjs 2026-06） */
const END_YM = process.argv[2] ?? '2025-12';
const MONTHS = 24;

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright が見つかりません。Playwright と Chromium を用意してから実行してください。');
  process.exit(1);
}

/** 撮影に使う日本語フォント（iPhone のヒラギノがなければ、Linux でよく使われる Noto Sans CJK JP など） */
const JA_FONTS = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'Noto Sans JP', 'IPAPGothic', sans-serif";
try {
  const list = execFileSync('fc-list', [':lang=ja', 'family'], { encoding: 'utf8' });
  if (!/Noto Sans CJK JP|Noto Sans JP|IPAPGothic|Hiragino/.test(list)) {
    console.warn('注意: 日本語フォントが見つかりません。漢字が中国語の字形で写る可能性があります（例: apt-get install fonts-noto-cjk）。');
  }
} catch {
  // fc-list がない環境（macOS など）はヒラギノがある前提で続ける
}

// ---- 架空データ ----
let seed = 20251201;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (min, max) => Math.round((min + rand() * (max - min)) / 10) * 10;
const pick = (a) => a[Math.floor(rand() * a.length)];

const BANK = 'さくら架空銀行';
const CARD = 'みどり架空カード';
const EMONEY = 'ポケット架空マネー';

function buildCsv() {
  const rows = ['計算対象,日付,内容,金額（円）,保有金融機関,大項目,中項目,メモ,振替,ID'];
  const [ey, em] = END_YM.split('-').map(Number);
  let n = 0;
  for (let i = MONTHS - 1; i >= 0; i--) {
    const idx = ey * 12 + (em - 1) - i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const add = (day, content, amount, inst, large, middle, transfer = 0) => {
      n++;
      rows.push(`1,${y}/${m}/${Math.min(day, last)},${content},${amount},${inst},${large},${middle},,${transfer},FAKE${String(n).padStart(5, '0')}`);
    };
    add(25, '給与 カセウ商事', between(282000, 288000), BANK, '収入', '給与');
    if (m === 6 || m === 12) add(10, '賞与 カセウ商事', between(380000, 420000), BANK, '収入', '賞与');
    add(27, '家賃 架空ハイツ', -85000, BANK, '住宅', '家賃・地代');
    add(15, 'ひかり架空電力', -between(m >= 7 && m <= 9 ? 9000 : 5500, m >= 7 && m <= 9 ? 12000 : 8000), CARD, '水道・光熱費', '電気代');
    add(18, 'まち架空ガス', -between(m <= 3 || m === 12 ? 6000 : 3000, m <= 3 || m === 12 ? 8000 : 4500), CARD, '水道・光熱費', 'ガス・灯油代');
    if (m % 2 === 0) add(20, '架空市水道局', -between(4800, 5600), BANK, '水道・光熱費', '水道代');
    add(5, 'そら架空モバイル', -between(4200, 4600), CARD, '通信費', '携帯電話');
    for (let k = 0; k < 7; k++) add(1 + k * 4, pick(['架空マート', 'あさひ青果店', 'まるまるスーパー']), -between(1800, 6500), pick([CARD, EMONEY]), '食費', '食料品');
    for (let k = 0; k < 3; k++) add(3 + k * 9, pick(['定食屋ふくろう', 'すしの木(架空)', 'カフェ架空']), -between(900, 3800), CARD, '食費', '外食');
    add(12, 'ドラッグ架空', -between(1500, 4500), EMONEY, '日用品', 'ドラッグストア');
    add(8, 'みなと架空バス', -between(2000, 4000), EMONEY, '交通費', 'バス');
    add(22, pick(['架空シネマ', 'ゲームショップ架空', 'ほんの架空書店']), -between(1500, 6000), CARD, '趣味・娯楽', pick(['映画・音楽・ゲーム', '本']));
    if (m % 3 === 0) add(14, '架空アパレル', -between(5000, 15000), CARD, '衣服・美容', '衣服');
    if (m % 4 === 1) add(19, 'みどり架空クリニック', -between(1500, 4000), CARD, '健康・医療', '病院代');
    if (m === 7 || m === 12) add(16, '架空百貨店 贈答', -between(5000, 10000), CARD, '交際費', 'プレゼント代');
    add(26, 'みどり架空カード 引き落とし', -between(60000, 90000), BANK, '未分類', '未分類', 1);
  }
  return '﻿' + rows.join('\n') + '\n';
}

// ---- 撮影 ----
mkdirSync(OUT_DIR, { recursive: true });

const server = await preview({ root: ROOT, preview: { port: 4179, strictPort: false }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'block' });
  await page.goto(url);
  await page.waitForSelector('text=CSVファイルを選ぶ');
  // アプリのフォント指定は iPhone 向け（ヒラギノ）。撮影環境では日本語フォントを明示し、中国語の字形で描かれないようにする
  await page.addStyleTag({ content: `html, body, input, button, select, textarea, svg text { font-family: ${JA_FONTS} !important; }` });
  await page.locator('input[type=file]').setInputFiles({ name: `架空データ_${END_YM}.csv`, mimeType: 'text/csv', buffer: Buffer.from(buildCsv()) });
  await page.getByRole('button', { name: 'OK' }).click();

  const shot = async (name) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
    console.log(`docs/screenshots/${name}.png`);
  };
  const tab = (name) => page.getByRole('button', { name, exact: true }).first().click();

  const search = page.getByPlaceholder(/検索/);
  await search.fill('架空マート');
  await search.blur();
  // Chromium 独自の検索欄の消去ボタン（iPhone の Safari では入力中以外は出ない）を、撮影時だけ隠す
  await page.addStyleTag({ content: 'input::-webkit-search-cancel-button{display:none}' });
  await shot('transactions');

  await tab('グラフ');
  await tab('内訳');
  await shot('breakdown');

  await tab('推移');
  await shot('trend');

  await tab('集計');
  await tab('年間レポート');
  await shot('year-report');
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
