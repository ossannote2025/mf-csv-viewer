/**
 * テスト・動作確認用の架空データ（sample/*.csv）を生成する。
 * 店名・金融機関名はすべて架空。実行: npm run generate:sample
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import iconv from 'iconv-lite';

const BANK = 'さくら架空銀行';
const BANK2 = 'あおぞら架空信金';
const CARD = 'みどり架空カード';
const EMONEY = 'ポケット架空マネー';
const CARD2 = 'そよかぜ架空カード';
const EC = '架空通販モール';

// 決定的な乱数（毎回同じデータになるように）
let seed = 20250801;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10;

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

function monthRows(y: number, m: number): Row[] {
  const last = new Date(y, m, 0).getDate();
  const rows: Row[] = [];
  const add = (r: Partial<Row> & Pick<Row, 'content' | 'amount' | 'large' | 'middle'>) =>
    rows.push({ target: 1, day: 1 + Math.floor(rand() * last), inst: CARD, memo: '', transfer: 0, ...r });

  // 収入
  add({ day: 25, content: '給与 カセウ商事', amount: 285000, inst: BANK, large: '収入', middle: '給与' });
  add({ day: 10, content: 'ポイント還元', amount: between(100, 900), inst: CARD, large: '収入', middle: 'その他入金' });
  // 住宅・水道光熱・通信
  add({ day: 27, content: '家賃 ハナミズキ荘', amount: -78000, inst: BANK, large: '住宅', middle: '家賃・地代' });
  add({ content: 'ヒカリ架空電力', amount: -between(5000, 9000), large: '水道・光熱費', middle: '電気代' });
  add({ content: 'ほのお架空ガス', amount: -between(3000, 5000), large: '水道・光熱費', middle: 'ガス・灯油代' });
  add({ content: '架空市水道局', amount: -between(2500, 4000), inst: BANK, large: '水道・光熱費', middle: '水道代' });
  add({ content: 'ソラモバイル(架空)', amount: -between(2000, 4000), large: '通信費', middle: '携帯電話' });
  add({ content: 'ネットつながる光(架空)', amount: -5280, large: '通信費', middle: 'インターネット' });
  // 食費
  const shops = ['まるまるスーパー', 'ヨツバマート', 'こむぎベーカリー', 'あさひ青果店'];
  for (let i = 0; i < 12; i++) add({ content: pick(shops), amount: -between(400, 4500), inst: pick([CARD, EMONEY]), large: '食費', middle: '食料品' });
  const eats = ['定食屋ふくろう', 'カフェ・ミモザ', 'らーめん架空軒', 'すしの木(架空)'];
  for (let i = 0; i < 6; i++)
    add({ content: pick(eats), amount: -between(600, 3500), inst: pick([CARD, EMONEY]), large: '食費', middle: '外食', memo: i === 0 ? '友人とランチ' : '' });
  add({ content: 'ｺﾝﾋﾞﾆ ｱｵｲ', amount: -between(150, 800), inst: EMONEY, large: '食費', middle: 'カフェ' });
  // 日用品
  for (let i = 0; i < 4; i++) add({ content: pick(['くらしのドラッグ', 'ホームセンターかしわ', '100えんショップ架空']), amount: -between(300, 3000), large: '日用品', middle: pick(['日用品', 'ドラッグストア']) });
  // 交通費
  for (let i = 0; i < 4; i++) add({ content: pick(['架空鉄道', 'みなと架空バス']), amount: -between(200, 1200), inst: EMONEY, large: '交通費', middle: pick(['電車', 'バス']) });
  add({ content: 'タクシー架空交通', amount: -between(1200, 3000), large: '交通費', middle: 'タクシー', memo: '雨の日' });
  // 趣味・娯楽
  for (let i = 0; i < 4; i++) add({ content: pick(['シネマ架空座', '本のこもれび堂', 'ゲームショップ架空', '架空スポーツジム']), amount: -between(800, 6000), large: '趣味・娯楽', middle: pick(['映画・音楽・ゲーム', '本', 'スポーツ']) });
  // カード引き落とし（銀行側の出金。重複計上の典型例 → 除外ルールで外す想定）
  add({ day: 27, content: 'カード引き落とし ミドリカード', amount: -between(60000, 90000), inst: BANK, large: '未分類', middle: '未分類' });
  // 振替
  add({ day: 26, content: '口座振替 さくら→あおぞら', amount: -30000, inst: BANK, large: '未分類', middle: '未分類', transfer: 1 });
  add({ day: 26, content: '口座振替 さくら→あおぞら', amount: 30000, inst: BANK2, large: '未分類', middle: '未分類', transfer: 1 });
  add({ content: 'ポケット架空マネー チャージ', amount: -5000, inst: CARD, large: '未分類', middle: '未分類', transfer: 1 });
  // 計算対象外
  add({ content: '立替分 精算予定', amount: -between(2000, 8000), large: 'その他', middle: '立替金', target: 0, memo: '後で返してもらう' });
  add({ content: '旧口座 残高調整', amount: between(100, 500), inst: BANK2, large: '収入', middle: 'その他入金', target: 0 });
  // 50件程度になるまで食費を足す
  while (rows.length < 50) add({ content: pick(shops), amount: -between(300, 3000), inst: pick([CARD, EMONEY]), large: '食費', middle: '食料品' });

  // マネーフォワードMEと同様に新しい日付が先
  return rows.sort((a, b) => b.day - a.day);
}

function toCsv(y: number, m: number, rows: Row[], padDate: boolean): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ['計算対象', '日付', '内容', '金額（円）', '保有金融機関', '大項目', '中項目', 'メモ', '振替', 'ID'];
  const lines = [header.map(q).join(',')];
  rows.forEach((r, i) => {
    const mm = padDate ? String(m).padStart(2, '0') : String(m);
    const dd = padDate ? String(r.day).padStart(2, '0') : String(r.day);
    const id = `SAMPLE${y}${String(m).padStart(2, '0')}${String(i + 1).padStart(3, '0')}`;
    lines.push([r.target, `${y}/${mm}/${dd}`, r.content, r.amount, r.inst, r.large, r.middle, r.memo, r.transfer, id].map(q).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

/**
 * 二重計上の確認用（2025年11月）：通常の明細に次を加える
 * - 振替になっていないカード引き落とし：ミドリカード（10月のカード利用額と同額）、半角カナの ｿﾖｶｾﾞｶｰﾄﾞ
 * - 振替になっている引き落とし（候補にならない）
 * - 通販とカードの重複（2日差）、4日差・同じ金融機関どうしの組（候補にならない）
 */
function doubleCountRows(y: number, m: number, prevCardTotal: number): Row[] {
  const rows = monthRows(y, m);
  const w = rows.find((r) => r.content === 'カード引き落とし ミドリカード');
  if (w) w.amount = -prevCardTotal;
  const add = (r: Partial<Row> & Pick<Row, 'day' | 'content' | 'amount' | 'inst'>) =>
    rows.push({ target: 1, large: '未分類', middle: '未分類', memo: '', transfer: 0, ...r });
  add({ day: 4, content: 'そよかぜ架空ベーカリー', amount: -1280, inst: CARD2, large: '食費', middle: '食料品' });
  add({ day: 12, content: '架空シネマ', amount: -1900, inst: CARD2, large: '趣味・娯楽', middle: '映画・音楽・ゲーム' });
  add({ day: 10, content: 'ｿﾖｶｾﾞｶｰﾄﾞ', amount: -24800, inst: BANK2 });
  add({ day: 15, content: 'ミドリカード 臨時払い', amount: -10000, inst: BANK, transfer: 1 });
  // 通販とカードの重複（2日差）→ 候補
  add({ day: 3, content: '架空ワイヤレスイヤホン', amount: -3978, inst: EC, large: '趣味・娯楽', middle: '映画・音楽・ゲーム' });
  add({ day: 5, content: 'カクウツウハンモール', amount: -3978, inst: CARD, large: '趣味・娯楽', middle: '映画・音楽・ゲーム' });
  // 4日差 → 候補にならない
  add({ day: 8, content: '架空ブックカバー', amount: -1198, inst: EC, large: '趣味・娯楽', middle: '本' });
  add({ day: 12, content: 'カクウツウハンモール', amount: -1198, inst: CARD, large: '趣味・娯楽', middle: '本' });
  // 同じ金融機関どうし → 候補にならない
  add({ day: 20, content: '架空電池', amount: -548, inst: EC, large: '日用品', middle: '日用品' });
  add({ day: 21, content: '架空電池', amount: -548, inst: EC, large: '日用品', middle: '日用品' });
  return rows.sort((a, b) => b.day - a.day);
}

/** カードの利用額の合計（請求額の目安。振替・計算対象外も含む） */
const cardTotal = (rows: Row[]) => -rows.filter((r) => r.inst === CARD).reduce((s, r) => s + r.amount, 0);

mkdirSync('sample', { recursive: true });
const files: { y: number; m: number; enc: 'sjis' | 'utf8bom' | 'utf8'; pad: boolean; label?: string }[] = [
  { y: 2025, m: 8, enc: 'sjis', pad: true },
  { y: 2025, m: 9, enc: 'utf8bom', pad: false },
  { y: 2025, m: 10, enc: 'utf8', pad: true },
  { y: 2025, m: 11, enc: 'utf8', pad: true, label: 'doublecount' },
];
let prev: Row[] = [];
for (const f of files) {
  const rows = f.label === 'doublecount' ? doubleCountRows(f.y, f.m, cardTotal(prev)) : monthRows(f.y, f.m);
  prev = rows;
  const csv = toCsv(f.y, f.m, rows, f.pad);
  const name = `sample/mf-sample-${f.y}-${String(f.m).padStart(2, '0')}-${f.label ? `${f.label}-` : ''}${f.enc}.csv`;
  const buf = f.enc === 'sjis' ? iconv.encode(csv, 'Shift_JIS') : Buffer.from((f.enc === 'utf8bom' ? '\uFEFF' : '') + csv, 'utf-8');
  writeFileSync(name, buf);
  console.log(`生成: ${name}`);
}
