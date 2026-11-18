import { describe, expect, it } from 'vitest';
import { findRecurring, groupByChoice, recurringKey } from './recurring';
import { ymRange } from './series';
import type { ExclusionMap, RecurringChoice, Transaction } from './types';

let seq = 0;
function tx(date: string, amount: number, content: string, p: Partial<Transaction> = {}): Transaction {
  seq++;
  return {
    id: `R${seq}`, date, ym: date.slice(0, 7), content, amount, institution: '架空カード', large: '通信費', middle: '携帯電話', memo: '',
    isTarget: true, isTransfer: false, sourceFile: 'f', row: seq, importedAt: 0, ...p,
  };
}

/** from〜to の毎月 day 日に amount（月ごとに変えるときは関数） */
function monthly(from: string, to: string, day: number, amount: number | ((ym: string, i: number) => number), content: string, p: Partial<Transaction> = {}) {
  return ymRange(from, to).map((ym, i) => tx(`${ym}-${String(day).padStart(2, '0')}`, -(typeof amount === 'number' ? amount : amount(ym, i)), content, p));
}

const none: ExclusionMap = new Map();
/** データの最新の月を 2026-11 にするための明細 */
const latest = tx('2026-11-02', -100, '架空コンビニ 一回だけ', { large: '食費' });
const find = (ts: Transaction[]) => findRecurring(ts, none).items;

describe('recurringKey', () => {
  it('全角・半角・空白・記号・「10月分」などの数字の違いを無視する', () => {
    expect(recurringKey('ｶｸｳﾃﾞﾝｷ 10月分')).toBe(recurringKey('カクウデンキ　11月分'));
    expect(recurringKey('ＡＢＣ動画 (2026/10)')).toBe('abc動画');
  });
});

describe('findRecurring', () => {
  it('同じ名前が直近12か月のうち3か月以上あれば候補。月あたりは12か月の合計÷12', () => {
    const items = find([latest, ...monthly('2025-06', '2026-11', 10, 3278, '架空モバイル'), ...monthly('2026-10', '2026-11', 3, 500, '架空アプリ')]);
    expect(items.map((i) => [i.label, i.kind, i.count, i.monthlyCost, i.stopped])).toEqual([['架空モバイル', 'regular', 12, 3278, false]]);
    expect(items[0].history).toHaveLength(12);
    expect(items[0].history.at(-1)).toEqual({ ym: '2026-11', amount: 3278 });
  });

  it('金額・日がばらばらでも、1か月に2件あっても、2か月ごとでも候補になる', () => {
    const lesson = { large: '教養・教育', middle: '習いごと' };
    const items = find([
      latest,
      // 家族2人分の携帯料金（同じ名前・毎月2件・金額が毎月変わる）
      ...monthly('2025-12', '2026-11', 30, (_ym, i) => 2500 + ((i * 173) % 600), '架空テレコム利用料金'),
      ...monthly('2025-12', '2026-11', 28, (_ym, i) => 1200 + ((i * 59) % 300), '架空テレコム利用料金'),
      // 2か月ごと・金額がコースで変わる
      ...[['2026-01', 15400], ['2026-03', 15400], ['2026-05', 18700], ['2026-07', 8800], ['2026-09', 17000], ['2026-11', 15400]].map(([ym, a]) =>
        tx(`${ym}-0${(Number(String(ym).slice(5)) % 3) + 4}`, -a, '架空(スイミング', lesson),
      ),
    ]);
    const tel = items.find((i) => i.label === '架空テレコム利用料金')!;
    expect(tel.count).toBe(12);
    expect(tel.ids).toHaveLength(24);
    const swim = items.find((i) => i.label === '架空(スイミング')!;
    expect([swim.count, swim.monthlyCost, swim.stopped, swim.large]).toEqual([6, (15400 * 3 + 18700 + 8800 + 17000) / 12, false, '教養・教育']);
  });

  it('食費・日用品・交通費などの大項目、ガソリン、振替・計算対象外・除外した明細・収入は使わない', () => {
    const ts = [
      latest,
      ...monthly('2026-01', '2026-11', 5, 4000, '架空スーパー', { large: '食費', middle: '食料品' }),
      ...monthly('2026-01', '2026-11', 5, 6000, '架空石油', { large: '自動車', middle: 'ガソリン' }),
      ...monthly('2026-01', '2026-11', 5, 9000, '架空駐車場', { large: '自動車', middle: '駐車場' }),
      ...monthly('2026-01', '2026-11', 25, 50000, '架空カード引落', { isTransfer: true }),
      ...monthly('2026-01', '2026-11', 25, 700, '架空対象外', { isTarget: false }),
      ...monthly('2026-01', '2026-11', 25, -300000, '架空給与'),
    ];
    const excludedTxs = monthly('2026-01', '2026-11', 7, 1000, '架空除外');
    const excluded: ExclusionMap = new Map(excludedTxs.map((t) => [t.id, ['r1']]));
    expect(findRecurring([...ts, ...excludedTxs], excluded).items.map((i) => i.label)).toEqual(['架空駐車場']);
  });

  it('最後に出た月から4か月以上たったものは「止まった」。12か月以上前に止まったものは出さない', () => {
    const items = find([
      latest,
      ...monthly('2025-01', '2026-07', 1, 980, '架空音楽'),
      ...monthly('2025-01', '2026-08', 1, 500, '架空ニュース'),
      ...monthly('2024-01', '2025-10', 1, 300, '架空ずっと前'),
    ]);
    expect(items.map((i) => [i.label, i.stopped, i.lastYm])).toEqual([
      ['架空音楽', true, '2026-07'],
      ['架空ニュース', false, '2026-08'],
    ]);
    // 止まったものの棒グラフは、最後に出た月までの12か月
    expect(items[0].history.at(-1)).toEqual({ ym: '2026-07', amount: 980 });
  });

  it('年1回：2年続けて同じ月ごろに出ていれば候補。次の年を1か月過ぎても出なければ止まった', () => {
    const items = find([
      latest,
      tx('2024-04-10', -24000, '架空保険 年払い', { large: '保険', middle: '生命保険' }),
      tx('2025-04-12', -24000, '架空保険 年払い', { large: '保険', middle: '生命保険' }),
      tx('2026-05-01', -25000, '架空保険 年払い', { large: '保険', middle: '生命保険' }),
      tx('2024-08-01', -5500, '架空年会費', { large: '教養・教育', middle: '書籍' }),
      tx('2025-08-01', -5500, '架空年会費', { large: '教養・教育', middle: '書籍' }),
      // 1回だけ・2年おきは出さない
      tx('2026-02-01', -9000, '架空一回だけ', { large: '趣味・娯楽', middle: '本' }),
      tx('2022-03-01', -9000, '架空二年おき', { large: '趣味・娯楽', middle: '本' }),
      tx('2024-03-01', -9000, '架空二年おき', { large: '趣味・娯楽', middle: '本' }),
    ]);
    expect(items.map((i) => [i.label, i.kind, i.count, i.yearlyAmount, i.stopped])).toEqual([
      ['架空保険 年払い', 'yearly', 3, 25000, false],
      ['架空年会費', 'yearly', 2, 5500, true],
    ]);
    expect(items[0].monthlyCost).toBeCloseTo(25000 / 12);
  });

  it('光熱費は中項目でまとめる（ガス会社の請求名が変わっても1つの候補）', () => {
    const gas = { large: '水道・光熱費', middle: 'ガス・灯油代' };
    const items = find([latest, ...monthly('2025-12', '2026-05', 20, 5000, 'ｶｸｳ ｶﾞｽ', gas), ...monthly('2026-06', '2026-11', 22, 4000, '架空ガス', gas)]);
    expect(items.map((i) => [i.key, i.label, i.count])).toEqual([['u|ガス・灯油代', '架空ガス', 12]]);
  });
});

describe('同じ名前・同じ金額の年1回（0.10.2）', () => {
  const pay = (date: string, amount: number, large: string, memo = '') =>
    tx(date, -amount, 'セブン-イレブン 支払', { memo, large, middle: 'その他', institution: '架空マネー' });
  // 同じ店でいろいろ払っている中に、毎年5月の ¥34,500 がある（大項目は年によって違い、メモはあったりなかったり）
  const store = [
    pay('2022-05-17', 34500, '税・社会保障', '自動車税'),
    pay('2023-05-09', 34500, '自動車'),
    pay('2024-05-31', 34500, '自動車', '自動車税'),
    pay('2025-05-10', 34500, '教養・教育'),
    pay('2026-05-17', 34500, '税・社会保障'),
    pay('2025-09-27', 32500, '教養・教育', '架空保育園'),
    pay('2026-01-01', 40000, '通信費', '架空ギフトカード'),
    pay('2026-09-07', 39999, '教養・教育'),
    pay('2026-10-28', 25000, '通信費'),
    pay('2026-10-31', 25000, '通信費'),
  ];

  it('名前の候補とは別に「名前（金額）」の年1回の候補を出す。メモ・大項目には頼らない', () => {
    const items = find([latest, ...store]);
    expect(items.map((i) => [i.key, i.label, i.kind, i.count, i.yearlyAmount, i.stopped])).toEqual([
      // 名前の候補：最後に出た月（2026-10）までの12か月に出た月（1・5・9・10月）
      ['セブンイレブン支払', 'セブン-イレブン 支払', 'regular', 4, 40000 + 34500 + 39999 + 25000 * 2, false],
      ['セブンイレブン支払|34500', 'セブン-イレブン 支払（¥34,500）', 'yearly', 5, 34500, false],
    ]);
    expect(items[1].ids).toHaveLength(5);
  });

  it('メモの名前ではまとめない（0.10.1 の「メモでまとめる」はやめた）', () => {
    const items = find([latest, ...store]);
    expect(items.some((i) => i.label.includes('自動車税'))).toBe(false);
  });

  it('金額が違う年・同じ年に同じ金額が2回あるものは年1回にしない。名前の候補が年1回なら、同じ金額の候補は出さない', () => {
    const items = find([
      latest,
      // 金額が変わった（名前だけなら年1回なので、名前の候補として出る）
      pay('2025-05-10', 34500, '税・社会保障'),
      pay('2026-05-17', 36000, '税・社会保障'),
      // 同じ年に2回
      tx('2025-03-01', -5000, '架空ショップ', { large: '趣味・娯楽', middle: '本' }),
      tx('2025-12-01', -5000, '架空ショップ', { large: '趣味・娯楽', middle: '本' }),
      tx('2026-03-01', -5000, '架空ショップ', { large: '趣味・娯楽', middle: '本' }),
      // 名前だけで年1回
      tx('2025-04-10', -24000, '架空保険 年払い', { large: '保険', middle: '生命保険' }),
      tx('2026-04-12', -24000, '架空保険 年払い', { large: '保険', middle: '生命保険' }),
    ]);
    expect(items.map((i) => i.label)).toEqual(['セブン-イレブン 支払', '架空保険 年払い']);
  });
});

describe('年4回の税金（0.10.3）', () => {
  // 6・7・9・12月の4回払い。1期目だけ金額が違う
  const tax = (date: string, amount: number) => tx(date, -amount, '架空シ コテイシサンゼイ', { large: '税・社会保障', middle: 'その他税・社会保障', institution: '架空銀行' });
  const years = (ys: number[]) => ys.flatMap((y) => [tax(`${y}-06-01`, 36500), tax(`${y}-07-31`, 33000), tax(`${y}-09-30`, 33000), tax(`${y}-12-25`, 33000)]);

  it('いつもの最長の間隔（12月→6月の6か月）を過ぎるまでは「止まった」にしない', () => {
    const at = (ym: string) => tx(`${ym}-02`, -100, '架空コンビニ', { large: '食費' });
    const base = [...years([2024, 2025]), tax('2026-06-01', 36500), tax('2026-07-31', 33000)];
    const stoppedOf = (ts: Transaction[]) => find(ts).find((i) => i.kind === 'regular')!.stopped;
    // 7月のあと9月分がまだない11月：4か月たったが、いつもの最長（6か月）以内
    expect(stoppedOf([at('2026-11'), ...base])).toBe(false);
    // 2027年2月（7か月）：止まった
    expect(stoppedOf([at('2027-02'), ...base])).toBe(true);
    // 12月のあと6月を待つ5月：止まっていない
    expect(stoppedOf([at('2026-05'), ...years([2024, 2025])])).toBe(false);
  });

  it('毎月のものは、今までどおり4か月で「止まった」', () => {
    const items = find([latest, ...monthly('2025-01', '2026-07', 1, 980, '架空音楽')]);
    expect(items.map((i) => i.stopped)).toEqual([true]);
  });

  it('名前の候補を固定費に入れたら、その名前の「（金額）」の候補は出さない。入れない・未確認なら出す', () => {
    const items = find([latest, ...years([2024, 2025]), tax('2026-06-01', 36500), tax('2026-07-31', 33000)]);
    expect(items.map((i) => [i.label, i.kind, i.parentKey])).toEqual([
      ['架空シ コテイシサンゼイ', 'regular', undefined],
      ['架空シ コテイシサンゼイ（¥36,500）', 'yearly', items[0].key],
    ]);
    const choice = (c: RecurringChoice['choice']): RecurringChoice[] => [{ key: items[0].key, choice: c, label: '', decidedAt: 0 }];
    const labels = (g: ReturnType<typeof groupByChoice>) => [...g.fixed.flatMap((x) => x.items), ...g.undecided, ...g.notFixed].map((i) => i.label);
    expect(labels(groupByChoice(items, choice('fixed')))).toEqual(['架空シ コテイシサンゼイ']);
    expect(labels(groupByChoice(items, choice('notFixed')))).toEqual(['架空シ コテイシサンゼイ（¥36,500）', '架空シ コテイシサンゼイ']);
    expect(labels(groupByChoice(items, []))).toHaveLength(2);
  });
});

describe('groupByChoice', () => {
  const ts = [
    latest,
    ...monthly('2025-12', '2026-11', 10, 3000, '架空モバイル'),
    ...monthly('2025-12', '2026-11', 10, 1200, '架空光回線', { large: '通信費', middle: 'インターネット' }),
    ...monthly('2025-12', '2026-11', 6, 12000, '架空ゼミ', { large: '教養・教育', middle: '塾' }),
    ...monthly('2025-12', '2026-11', 18, 12, '国税', { large: '税・社会保障', middle: '所得税・住民税' }),
    ...monthly('2025-06', '2026-06', 1, 980, '架空音楽', { large: '趣味・娯楽', middle: '音楽' }),
    ...monthly('2025-06', '2026-05', 1, 600, '架空止まった候補', { large: '趣味・娯楽', middle: '音楽' }),
  ];
  const items = findRecurring(ts, none).items;
  const c = (key: string, choice: RecurringChoice['choice']): RecurringChoice => ({ key, choice, label: key, decidedAt: 0 });

  it('何も選んでいなければ、止まっていない候補は未確認、止まったものは「最近止まったもの」（新しい順）', () => {
    const g = groupByChoice(items, []);
    expect(g.undecided.map((i) => i.label)).toEqual(['架空ゼミ', '架空モバイル', '架空光回線', '国税']);
    expect(g.stopped.map((i) => i.label)).toEqual(['架空音楽', '架空止まった候補']);
    expect([g.fixed, g.notFixed, g.monthlyTotal]).toEqual([[], [], 0]);
  });

  it('「入れない」にしたものは、止まっても「最近止まったもの」に出さない', () => {
    const g = groupByChoice(items, [c('架空止まった候補', 'notFixed')]);
    expect(g.stopped.map((i) => i.label)).toEqual(['架空音楽']);
    expect(g.notFixed.map((i) => i.label)).toEqual(['架空止まった候補']);
  });

  it('固定費に入れたものを大項目ごとにまとめ、止まっていないものだけ合計する', () => {
    const g = groupByChoice(items, [c('架空モバイル', 'fixed'), c('架空光回線', 'fixed'), c('架空ゼミ', 'fixed'), c('架空音楽', 'fixed'), c('国税', 'notFixed')]);
    expect(g.fixed.map((x) => [x.large, x.items.map((i) => i.label), x.monthlyTotal])).toEqual([
      ['教養・教育', ['架空ゼミ'], 12000],
      ['通信費', ['架空モバイル', '架空光回線'], 4200],
    ]);
    expect(g.monthlyTotal).toBe(16200);
    expect(g.stopped.map((i) => i.label)).toEqual(['架空音楽', '架空止まった候補']);
    expect(g.notFixed.map((i) => i.label)).toEqual(['国税']);
    expect(g.undecided).toEqual([]);
  });
});
