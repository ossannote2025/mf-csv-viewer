/**
 * 初めて使う人が試すためのサンプル CSV（public/sample/mf-sample-YYYY.csv）を生成する。
 * 2023年1月〜2026年10月の架空の家計（共働き・子ども1人）。店名・金融機関名・人名はすべて架空。
 * iPhone アプリの年ごとの CSV と同じく、1ファイル＝1年分（UTF-8 BOM あり、新しい日付が先）。
 * 実行: npm run generate:demo
 *
 * アプリの機能をひととおり試せるように、次の明細を入れている。
 * - 固定費：電気・ガス（2025年4月に請求名が変わる）・水道（2か月ごと）・携帯・ネット・サブスク（途中で値上げ・開始・停止）
 *   塾（金額が月ごとに違う）・スイミング（2か月ごと）・生命保険・自動車保険（年1回）
 *   自動車税（毎年5月、コンビニ払い ¥34,500。同じ名前でほかの支払いもある）・固定資産税（6・7・9・12月の4回払い）
 * - 二重計上の候補：振替になっていないカードの引き落とし（2回）、通販とカードの組（ときどき）
 * - 振替：カードの引き落とし・電子マネーのチャージ・ATM の引き出し。計算対象外：立替
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const BANK = 'さくら架空銀行';
const CARD = 'みどり架空カード';
const CARD2 = 'そよかぜ架空カード';
const EMONEY = 'ポケット架空マネー';
const EC = '架空通販モール';
const WALLET = '財布（現金）';

const FIRST = { y: 2023, m: 1 };
const LAST = { y: 2026, m: 10 };
/** 二重計上の候補にする（振替にしない）カードの引き落としの月 */
const UNFLAGGED_WITHDRAWAL = new Set(['2024-07', '2026-09']);

// 決定的な乱数（毎回同じデータになるように）
let seed = 20230101;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
const chance = (p: number) => rand() < p;

interface Row {
  target: 0 | 1;
  day: number;
  content: string;
  amount: number;
  inst: string;
  large: string;
  middle: string;
  memo: string;
  transfer: 0 | 1;
}
type NewRow = Partial<Row> & Pick<Row, 'content' | 'amount' | 'large' | 'middle'>;

/** 月の通し番号（2023年1月＝0） */
const index = (y: number, m: number) => (y - FIRST.y) * 12 + (m - FIRST.m);

function monthRows(y: number, m: number, prevCardTotal: number, prevCard2Total: number): Row[] {
  const last = new Date(y, m, 0).getDate();
  const ym = `${y}-${String(m).padStart(2, '0')}`;
  const i = index(y, m);
  const rows: Row[] = [];
  const add = (r: NewRow) => rows.push({ target: 1, day: 1 + Math.floor(rand() * last), inst: CARD, memo: '', transfer: 0, ...r });
  const after = (yy: number, mm: number) => i >= index(yy, mm);
  const summer = m >= 7 && m <= 9;
  const winter = m === 12 || m <= 3;

  // ===== 収入 =====
  const raise = (y - FIRST.y) * 6000 + (m >= 4 ? 6000 : 0);
  add({ day: 25, content: '給与 カセウ商事', amount: 312000 + raise, inst: BANK, large: '収入', middle: '給与' });
  add({ day: 15, content: '給与 ひなた架空ベーカリー', amount: between(78000, 96000), inst: BANK, large: '収入', middle: '給与', memo: 'パート' });
  if (m === 6 || m === 12) add({ day: 10, content: '賞与 カセウ商事', amount: 520000 + raise * 4, inst: BANK, large: '収入', middle: '一時所得' });
  if (m % 2 === 0) add({ day: 13, content: '児童手当 架空市', amount: 20000, inst: BANK, large: '収入', middle: 'その他入金' });
  add({ day: 10, content: 'ポイント還元 ミドリカード', amount: between(200, 1200), inst: CARD, large: '収入', middle: 'その他入金' });
  if (m === 3) add({ content: '架空フリマ 売上金', amount: between(2000, 9000), inst: BANK, large: '収入', middle: 'その他入金' });

  // ===== 住宅・税 =====
  add({ day: 27, content: '住宅ローン 架空ハウジング', amount: -98500, inst: BANK, large: '住宅', middle: 'ローン返済' });
  add({ day: 27, content: '管理費 架空レジデンス', amount: -16800, inst: BANK, large: '住宅', middle: '管理費・積立金' });
  // 固定資産税：6・7・9・12月の4回払い（1期目だけ金額が違う）
  if (m === 6) add({ day: 30, content: '架空市 固定資産税', amount: -36500, inst: BANK, large: '税・社会保障', middle: '固定資産税' });
  if (m === 7 || m === 9 || m === 12) add({ day: 31 > last ? last : 31, content: '架空市 固定資産税', amount: -35700, inst: BANK, large: '税・社会保障', middle: '固定資産税' });
  // 自動車税：毎年5月にコンビニで払う。同じ名前でほかの支払いもある
  if (m === 5) add({ day: 20, content: 'コンビニ架空 支払', amount: -34500, inst: CARD, large: '税・社会保障', middle: '自動車税' });
  if (chance(0.35)) add({ content: 'コンビニ架空 支払', amount: -between(1500, 8000), inst: CARD, large: '日用品', middle: '日用品', memo: '通販の代金' });

  // ===== 水道・光熱費 =====
  const elec = summer ? between(11000, 15000) : winter ? between(12000, 17000) : between(7000, 10000);
  add({ day: 18, content: 'ヒカリ架空電力', amount: -elec, inst: CARD, large: '水道・光熱費', middle: '電気代' });
  const gas = winter ? between(7000, 10000) : between(3500, 5500);
  add({ day: 22, content: after(2025, 4) ? 'ほのおエナジー(架空)' : 'ほのお架空ガス', amount: -gas, inst: CARD, large: '水道・光熱費', middle: 'ガス・灯油代' });
  if (m % 2 === 1) add({ day: 26, content: '架空市上下水道局', amount: -between(7800, 9600), inst: BANK, large: '水道・光熱費', middle: '水道代' });

  // ===== 通信費・サブスク =====
  add({ day: 28, content: 'ソラモバイル(架空)', amount: -between(6400, 7600), inst: CARD, large: '通信費', middle: '携帯電話' });
  add({ day: 28, content: 'ネットつながる光(架空)', amount: -5720, inst: CARD, large: '通信費', middle: 'インターネット' });
  add({ day: 5, content: '架空動画チャンネル', amount: after(2025, 2) ? -1490 : -990, inst: CARD, large: '通信費', middle: '情報サービス' });
  if (after(2024, 3)) add({ day: 12, content: '架空ミュージック', amount: -1080, inst: CARD, large: '趣味・娯楽', middle: '映画・音楽・ゲーム' });
  if (!after(2026, 5)) add({ day: 3, content: '架空マガジン読み放題', amount: -550, inst: CARD, large: '教養・教育', middle: '新聞・雑誌' });
  add({ day: 8, content: '架空クラウド保存', amount: -400, inst: CARD2, large: '通信費', middle: '情報サービス' });

  // ===== 保険・教育 =====
  add({ day: 27, content: '架空生命 保険料', amount: -14200, inst: BANK, large: '保険', middle: '生命保険' });
  if (m === 2) add({ day: 14, content: 'あんしん架空損保 自動車保険', amount: after(2025, 1) ? -61800 : -58400, inst: CARD, large: '保険', middle: 'その他保険' });
  if (after(2024, 4)) add({ day: 6, content: '架空ゼミナール', amount: -(m === 7 || m === 8 || m === 12 || m === 1 ? between(32000, 41000) : between(18000, 24000)), inst: BANK, large: '教養・教育', middle: '塾' });
  if (m % 2 === 0) add({ day: 4, content: '架空スイミングクラブ', amount: -13200, inst: CARD, large: '教養・教育', middle: '習いごと' });
  if (m === 4) add({ content: '本のこもれび堂 参考書', amount: -between(3000, 7000), inst: CARD, large: '教養・教育', middle: '書籍' });

  // ===== 自動車 =====
  for (let k = 0; k < 2; k++) add({ content: 'ガソリンスタンド架空', amount: -between(4000, 7500), inst: CARD2, large: '自動車', middle: 'ガソリン' });
  add({ day: 25, content: '架空パーキング 月極', amount: -12000, inst: BANK, large: '自動車', middle: '駐車場' });
  if (chance(0.3)) add({ content: '架空高速道路', amount: -between(800, 4500), inst: CARD2, large: '自動車', middle: '道路料金' });

  // ===== 食費 =====
  const shops = ['まるまるスーパー', 'ヨツバマート', 'こむぎベーカリー', 'あさひ青果店', '架空生協'];
  const nShop = 14 + Math.floor(rand() * 6);
  for (let k = 0; k < nShop; k++) add({ content: pick(shops), amount: -between(500, 6500), inst: pick([CARD, CARD, EMONEY]), large: '食費', middle: '食料品' });
  const eats = ['定食屋ふくろう', 'カフェ・ミモザ', 'らーめん架空軒', 'すしの木(架空)', 'ピザ工房こむぎ'];
  const nEat = 3 + Math.floor(rand() * 4);
  for (let k = 0; k < nEat; k++) add({ content: pick(eats), amount: -between(900, 6800), inst: pick([CARD, EMONEY]), large: '食費', middle: '外食' });
  for (let k = 0; k < 4; k++) add({ content: 'ｺﾝﾋﾞﾆ ｱｵｲ', amount: -between(150, 900), inst: EMONEY, large: '食費', middle: 'カフェ' });

  // ===== 日用品・交通・衣服・医療・娯楽・交際 =====
  for (let k = 0; k < 4; k++)
    add({ content: pick(['くらしのドラッグ', 'ホームセンターかしわ', '100えんショップ架空']), amount: -between(300, 4000), inst: pick([CARD, EMONEY]), large: '日用品', middle: pick(['日用品', 'ドラッグストア']) });
  for (let k = 0; k < 3; k++) add({ content: pick(['架空鉄道', 'みなと架空バス']), amount: -between(200, 1200), inst: EMONEY, large: '交通費', middle: pick(['電車', 'バス']) });
  if (chance(0.6)) add({ content: pick(['ふくのいえ架空', 'こども服ポプラ']), amount: -between(1500, 9000), inst: CARD, large: '衣服・美容', middle: '衣服' });
  if (m % 2 === 1) add({ content: 'ヘアサロン架空', amount: -between(4000, 6500), inst: CARD, large: '衣服・美容', middle: '美容院・理髪' });
  if (chance(0.5)) add({ content: pick(['架空こどもクリニック', 'やまびこ架空歯科', 'みどり架空薬局']), amount: -between(500, 4000), inst: WALLET, large: '健康・医療', middle: pick(['医療費', '薬']) });
  for (let k = 0; k < 2; k++)
    add({ content: pick(['シネマ架空座', 'ゲームショップ架空', '架空どうぶつ園', '本のこもれび堂']), amount: -between(800, 6000), inst: CARD, large: '趣味・娯楽', middle: pick(['映画・音楽・ゲーム', 'レジャー', '本']) });
  if (chance(0.4)) add({ content: '架空居酒屋 はなび', amount: -between(3000, 8000), inst: CARD, large: '交際費', middle: '飲み会' });
  if (m === 12) add({ day: 20, content: 'おもちゃの架空堂', amount: -between(5000, 12000), inst: CARD, large: '交際費', middle: 'プレゼント代', memo: 'クリスマス' });

  // ===== 特別な支出 =====
  if (m === 8) add({ day: 12, content: '架空トラベル 宿泊', amount: -between(48000, 72000), inst: CARD, large: '特別な支出', middle: '旅行', memo: '夏休みの旅行' });
  if (ym === '2024-11') add({ day: 23, content: '架空電機 冷蔵庫', amount: -168000, inst: CARD, large: '特別な支出', middle: '家電', memo: '買い替え' });
  if (ym === '2026-03') add({ day: 15, content: '架空家具店 ランドセルラック', amount: -24800, inst: CARD, large: '特別な支出', middle: '家具' });

  // ===== 通販（ときどきカード側にも同じ金額が入り、二重計上の候補になる） =====
  const nEc = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < nEc; k++) {
    const item = pick([
      { content: '架空ワイヤレスイヤホン', large: '趣味・娯楽', middle: '映画・音楽・ゲーム' },
      { content: '架空洗剤 詰め替え', large: '日用品', middle: '日用品' },
      { content: '架空キッチンタオル', large: '日用品', middle: '日用品' },
      { content: '架空えほん セット', large: '教養・教育', middle: '書籍' },
    ]);
    const day = 1 + Math.floor(rand() * (last - 3));
    const amount = -(between(980, 6000) + 8);
    add({ ...item, day, amount, inst: EC });
    if (k === 0 && i % 5 === 2) add({ day: day + 2, content: 'カクウツウハンモール', amount, inst: CARD, large: item.large, middle: item.middle });
  }

  // ===== 振替・計算対象外 =====
  if (i > 0) {
    const flagged = !UNFLAGGED_WITHDRAWAL.has(ym);
    add({ day: 10, content: 'ミドリカード 引落', amount: -prevCardTotal, inst: BANK, large: flagged ? '現金・カード' : '未分類', middle: flagged ? 'カード引き落とし' : '未分類', transfer: flagged ? 1 : 0 });
    add({ day: 26, content: 'ソヨカゼカード 引落', amount: -prevCard2Total, inst: BANK, large: '現金・カード', middle: 'カード引き落とし', transfer: 1 });
  }
  add({ content: 'ポケット架空マネー チャージ', amount: -10000, inst: CARD, large: '現金・カード', middle: '電子マネー', transfer: 1 });
  add({ content: 'ポケット架空マネー チャージ', amount: 10000, inst: EMONEY, large: '現金・カード', middle: '電子マネー', transfer: 1 });
  add({ day: 2, content: 'ATM引出 架空駅前', amount: -20000, inst: BANK, large: '現金・カード', middle: 'ATM引き出し', transfer: 1 });
  add({ day: 2, content: 'ATM引出 架空駅前', amount: 20000, inst: WALLET, large: '現金・カード', middle: 'ATM引き出し', transfer: 1 });
  if (chance(0.3)) add({ content: '立替 子ども会の会費', amount: -between(2000, 6000), inst: CARD, large: 'その他', middle: '立替金', target: 0, memo: '後で返してもらう' });

  // マネーフォワードMEと同様に新しい日付が先
  return rows.sort((a, b) => b.day - a.day);
}

/** カードの利用額の合計（翌月の請求額。振替・計算対象外も含む） */
const total = (rows: Row[], inst: string) => -rows.filter((r) => r.inst === inst).reduce((s, r) => s + r.amount, 0);

function toLine(y: number, m: number, r: Row, n: number): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const id = `SAMPLE${y}${String(m).padStart(2, '0')}${String(n).padStart(3, '0')}`;
  const date = `${y}/${String(m).padStart(2, '0')}/${String(r.day).padStart(2, '0')}`;
  return [r.target, date, r.content, r.amount, r.inst, r.large, r.middle, r.memo, r.transfer, id].map(q).join(',');
}

const HEADER = ['計算対象', '日付', '内容', '金額（円）', '保有金融機関', '大項目', '中項目', 'メモ', '振替', 'ID'].map((h) => `"${h}"`).join(',');
const byYear = new Map<number, string[][]>();
let prevCard = 0;
let prevCard2 = 0;
for (let y = FIRST.y, m = FIRST.m; index(y, m) <= index(LAST.y, LAST.m); m === 12 ? (y++, (m = 1)) : m++) {
  const rows = monthRows(y, m, prevCard, prevCard2);
  prevCard = total(rows, CARD);
  prevCard2 = total(rows, CARD2);
  const lines = rows.map((r, n) => toLine(y, m, r, n + 1));
  byYear.set(y, [...(byYear.get(y) ?? []), lines]);
}

mkdirSync('public/sample', { recursive: true });
const names: string[] = [];
for (const [y, months] of byYear) {
  // 新しい月が先
  const body = months.reverse().flat();
  const name = `public/sample/mf-sample-${y}.csv`;
  writeFileSync(name, '﻿' + [HEADER, ...body].join('\r\n') + '\r\n', 'utf-8');
  names.push(name.replace('public/sample/', ''));
  console.log(`生成: ${name}（${body.length}件）`);
}

// アプリが使うファイルの一覧と期間（手で書き換えない）
const ym = (p: { y: number; m: number }) => `${p.y}-${String(p.m).padStart(2, '0')}`;
writeFileSync(
  'src/lib/sampleFiles.ts',
  `// scripts/generate-demo.ts が生成する。手で書き換えない（npm run generate:demo）\n` +
    `export const SAMPLE_FILES: readonly string[] = ${JSON.stringify(names)};\n` +
    `export const SAMPLE_PERIOD = { from: '${ym(FIRST)}', to: '${ym(LAST)}' } as const;\n`,
);
console.log('生成: src/lib/sampleFiles.ts');
