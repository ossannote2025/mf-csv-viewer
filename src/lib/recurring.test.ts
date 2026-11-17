import { describe, expect, it } from 'vitest';
import { findRecurring, recurringKey } from './recurring';
import { ymRange } from './series';
import type { ExclusionMap, Transaction } from './types';

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
const latest = tx('2026-11-02', -100, '架空コンビニ 一回だけ');

describe('recurringKey', () => {
  it('全角・半角・空白・記号・「10月分」などの数字の違いを無視する', () => {
    expect(recurringKey('ｶｸｳﾃﾞﾝｷ 10月分')).toBe(recurringKey('カクウデンキ　11月分'));
    expect(recurringKey('ＡＢＣ動画 (2026/10)')).toBe('abc動画');
  });
});

describe('findRecurring', () => {
  it('3か月以上続けて毎月1回あるものを「毎月」にする（2か月だけ・月に何度も行く店は外す）', () => {
    const ts = [
      latest,
      ...monthly('2025-12', '2026-11', 10, 3278, '架空モバイル'),
      ...monthly('2026-10', '2026-11', 3, 500, '架空アプリ'),
      // 月に2回・日も金額も毎回違う（同じ名前で支払いごとに分けても、日がそろわない）
      ...ymRange('2026-01', '2026-11').flatMap((ym, i) => [
        tx(`${ym}-${String(1 + ((i * 7) % 14)).padStart(2, '0')}`, -(3000 + i * 137), '架空スーパー'),
        tx(`${ym}-${String(15 + ((i * 11) % 14)).padStart(2, '0')}`, -(2500 + i * 211), '架空スーパー'),
      ]),
    ];
    const r = findRecurring(ts, none);
    expect(r.latestYm).toBe('2026-11');
    expect(r.monthly.map((i) => i.label)).toEqual(['架空モバイル']);
    expect(r.monthly[0]).toMatchObject({ amount: 3278, variable: false, count: 12, day: 10, intervalMonths: 1 });
    expect(r.monthly[0].history).toHaveLength(12);
    expect(r.monthlyTotal).toBe(3278);
  });

  it('今月がまだでも、先月まで続いていれば今も続いているとみなす', () => {
    const r = findRecurring([latest, ...monthly('2026-01', '2026-10', 27, 1490, '架空動画')], none);
    expect(r.monthly.map((i) => i.label)).toEqual(['架空動画']);
    expect(r.stopped).toEqual([]);
  });

  it('金額が毎月変わるもの（電気など）は平均を「前後」として出し、値上げは出さない', () => {
    const r = findRecurring([latest, ...monthly('2026-01', '2026-10', 27, (_ym, i) => 6000 + (i % 4) * 1500, 'カクウデンキ')], none);
    expect(r.monthly[0]).toMatchObject({ variable: true, amount: 7950 });
    expect(r.monthly[0].priceChange).toBeUndefined();
  });

  it('安定していた金額が変わったら値上げとして出す（6か月より前の変化は出さない）', () => {
    const up = monthly('2026-01', '2026-11', 3, (ym) => (ym >= '2026-09' ? 1490 : 990), '架空動画');
    const r = findRecurring(up, none);
    expect(r.monthly[0]).toMatchObject({ amount: 1490, variable: false, priceChange: { from: 990, to: 1490, ym: '2026-09' } });
    const old = monthly('2025-01', '2026-11', 3, (ym) => (ym >= '2025-03' ? 1490 : 990), '架空動画');
    expect(findRecurring(old, none).monthly[0].priceChange).toBeUndefined();
  });

  it('毎年同じ月に出るものと、数か月ごとのものを見つけ、月あたりの金額を見込みに足す', () => {
    const ts = [
      latest,
      tx('2024-04-20', -36000, '架空保険'),
      tx('2025-04-21', -36000, '架空保険'),
      tx('2026-04-20', -36000, '架空保険'),
      ...['2026-02', '2026-05', '2026-08', '2026-11'].map((ym) => tx(`${ym}-15`, -900, '架空水道')),
      // 1回だけ・間隔がばらばら
      tx('2026-03-01', -5000, '架空旅行'),
      tx('2025-06-01', -800, '架空書店'),
      tx('2026-01-01', -800, '架空書店'),
      tx('2026-06-01', -800, '架空書店'),
      // 同じ間隔でも、3回だけ・金額がばらばらのものは外す
      ...['2026-05', '2026-07', '2026-09'].map((ym) => tx(`${ym}-08`, -1200, '架空雑貨')),
      ...['2026-01', '2026-03', '2026-05', '2026-07', '2026-09'].map((ym, i) => tx(`${ym}-08`, -(500 + i * 900), '架空カフェ')),
    ];
    const r = findRecurring(ts, none);
    expect(r.periodic.map((i) => [i.label, i.intervalMonths, i.count, i.month])).toEqual([
      ['架空保険', 12, 3, 4],
      ['架空水道', 3, 4, 11],
    ]);
    expect(r.monthlyTotal).toBe(3000 + 300);
  });

  it('毎月続いていたのに2か月以上出ていないものは「最近止まったもの」にする（1年より前に止まったものは出さない）', () => {
    const ts = [
      latest,
      ...monthly('2025-10', '2026-08', 25, 7700, '架空ジム'),
      ...monthly('2024-01', '2024-12', 25, 500, '架空古いアプリ'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly).toEqual([]);
    expect(r.stopped.map((i) => [i.label, i.lastYm])).toEqual([['架空ジム', '2026-08']]);
    expect(r.stopped[0].history.at(-1)).toEqual({ ym: '2026-11', amount: 0 });
    expect(r.monthlyTotal).toBe(0);
  });

  it('たまたま毎月同じ店・同じ電車を使ったもの、年ごとに金額の違う買い物は固定費にしない', () => {
    const days = [3, 17, 9, 28, 12, 21, 6, 25, 14, 1, 19];
    const ts = [
      latest,
      // 日がばらばら（大項目は固定費になりうるものにしておく）
      ...ymRange('2026-01', '2026-11').map((ym, i) => tx(`${ym}-${String(days[i]).padStart(2, '0')}`, -110, '架空銀行 時間外手数料', { large: 'その他' })),
      // 毎月だいたい同じ日でも、食費・交通費・現金・カードは外す
      ...monthly('2026-01', '2026-11', 15, 1280, '架空定食 駅前店', { large: '食費' }),
      ...monthly('2026-01', '2026-11', 15, 420, '架空電鉄 A駅-B駅', { large: '交通費' }),
      ...monthly('2026-01', '2026-11', 15, 220, '架空ATM手数料', { large: '現金・カード' }),
      // 2年続けて同じ月の通販（金額が違う）
      tx('2025-03-10', -8800, '架空オンラインショップ', { large: 'その他' }),
      tx('2026-03-12', -5400, '架空オンラインショップ', { large: 'その他' }),
      // 本当の固定費：日が月末と月初をまたいで少しずれても同じ日とみなす
      ...ymRange('2026-01', '2026-11').map((ym, i) => tx(`${ym}-${i % 2 ? '30' : '02'}`, -1000, '架空クラウド', { large: '通信費' })),
    ];
    const r = findRecurring(ts, none);
    expect([...r.monthly, ...r.periodic, ...r.stopped].map((i) => i.label)).toEqual(['架空クラウド']);
    // 月数が偶数でも、30日と2日を同じ日とみなす
    const even = ymRange('2026-01', '2026-10').map((ym, i) => tx(`${ym}-${i % 2 ? '30' : '02'}`, -1000, '架空クラウド', { large: '通信費' }));
    expect(findRecurring([latest, ...even], none).monthly.map((i) => i.label)).toEqual(['架空クラウド']);
  });

  it('自動車のうち、ガソリン・道路料金は外し、駐車場などは固定費にする', () => {
    const ts = [
      latest,
      ...monthly('2026-01', '2026-11', 12, 2500, '架空石油 駅前SS', { large: '自動車', middle: 'ガソリン' }),
      ...monthly('2026-01', '2026-11', 12, 1200, '架空高速道路', { large: '自動車', middle: '道路料金' }),
      ...monthly('2026-01', '2026-11', 27, 15000, '架空パーキング 月極', { large: '自動車', middle: '駐車場' }),
    ];
    expect(findRecurring(ts, none).monthly.map((i) => i.label)).toEqual(['架空パーキング 月極']);
  });

  it('光熱費は中項目でまとめ、会社名の書き方が変わっても続けて数える', () => {
    const ts = [
      latest,
      ...monthly('2025-11', '2026-07', 20, (_ym, i) => 4000 + (i % 3) * 900, 'ｶｸｳ ｶﾞｽ ｶﾞｽﾘﾖｳｷﾝ', { large: '水道・光熱費', middle: 'ガス・灯油代' }),
      ...monthly('2026-08', '2026-11', 21, (_ym, i) => 4200 + i * 300, '架空ガス', { large: '水道・光熱費', middle: 'ガス・灯油代' }),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => [i.label, i.count, i.previousLabel])).toEqual([['架空ガス', 13, 'ｶｸｳ ｶﾞｽ ｶﾞｽﾘﾖｳｷﾝ']]);
    expect(r.stopped).toEqual([]);
  });

  it('同じ名前で毎月2回ある支払いは金額ごとに分け、前の名前とつなぐ', () => {
    const ts = [
      latest,
      ...monthly('2025-11', '2026-08', 7, 250, '架空クラウド ストレージ'),
      ...monthly('2025-11', '2026-08', 15, 1280, '架空動画 プレミアム'),
      // 9月から、2つとも同じ請求名に変わった
      ...monthly('2026-09', '2026-11', 7, 250, '架空ストア ジャパン'),
      ...monthly('2026-09', '2026-11', 15, 1280, '架空ストア ジャパン'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => [i.label, i.amount, i.count, i.previousLabel])).toEqual([
      ['架空ストア ジャパン', 1280, 13, '架空動画 プレミアム'],
      ['架空ストア ジャパン', 250, 13, '架空クラウド ストレージ'],
    ]);
    // 行ごとの明細：前の名前の明細を含み、同じ名前のもう片方は含まない
    const byId = new Map(ts.map((t) => [t.id, t]));
    const contents = (ids: string[]) => [...new Set(ids.map((id) => `${byId.get(id)!.content} ${-byId.get(id)!.amount}`))].sort();
    expect(r.monthly[0].ids).toHaveLength(13);
    expect(contents(r.monthly[0].ids)).toEqual(['架空ストア ジャパン 1280', '架空動画 プレミアム 1280']);
    expect(contents(r.monthly[1].ids)).toEqual(['架空クラウド ストレージ 250', '架空ストア ジャパン 250']);
    expect(r.stopped).toEqual([]);
    expect(r.monthlyTotal).toBe(1530);
  });

  it('同じ名前で毎月2件・金額が毎月変わる支払い（家族2人分の携帯料金）も、2行に分ける', () => {
    const ts = [
      latest,
      // 以前は1件だけ（高いほうの回線）
      ...monthly('2023-01', '2025-12', 30, (_ym, i) => 2600 + ((i * 97) % 400), '架空テレコム利用料金'),
      // 2026年から毎月2件。どちらも通話料で金額が変わる
      ...monthly('2026-01', '2026-11', 30, (_ym, i) => 2500 + ((i * 173) % 600), '架空テレコム利用料金'),
      ...monthly('2026-01', '2026-11', 30, (_ym, i) => 1200 + ((i * 59) % 300), '架空テレコム利用料金'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => [i.label, i.count, i.variable, i.day])).toEqual([
      ['架空テレコム利用料金', 47, true, 30],
      ['架空テレコム利用料金', 11, true, 30],
    ]);
    const byId = new Map(ts.map((t) => [t.id, t]));
    const amounts = (ids: string[]) => ids.map((id) => -byId.get(id)!.amount);
    // 1行目は高いほう（以前の1件だけの月も、金額の近いこちらにつながる）、2行目は安いほう
    expect(Math.min(...amounts(r.monthly[0].ids))).toBeGreaterThanOrEqual(2500);
    expect(Math.max(...amounts(r.monthly[1].ids))).toBeLessThan(1500);
    expect(r.monthly[0].ids.length + r.monthly[1].ids.length).toBe(ts.length - 1);
    expect(r.stopped).toEqual([]);
  });

  it('以前は1件だった安いほうの回線は、金額の近い行につながる', () => {
    const ts = [
      latest,
      ...monthly('2025-01', '2026-11', 30, (_ym, i) => 1200 + ((i * 59) % 300), '架空テレコム利用料金'),
      ...monthly('2026-06', '2026-11', 30, (_ym, i) => 2500 + ((i * 173) % 600), '架空テレコム利用料金'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => i.count)).toEqual([6, 23]);
  });

  it('同じ名前のいくつかの支払いのうち、途中で止まったものは「最近止まったもの」に出る（0.9.5）', () => {
    const ts = [
      latest,
      ...monthly('2024-01', '2026-11', 3, 130, '架空ストア 請求'),
      ...monthly('2024-01', '2026-11', 3, 1280, '架空ストア 請求'),
      ...monthly('2024-01', '2026-06', 3, 480, '架空ストア 請求'),
      ...monthly('2024-01', '2026-03', 12, 2900, '架空ストア 請求'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => [i.amount, i.variable, i.count])).toEqual([
      [1280, false, 35],
      [130, false, 35],
    ]);
    expect(r.stopped.map((i) => [i.amount, i.lastYm, i.day])).toEqual([
      [480, '2026-06', 3],
      [2900, '2026-03', 12],
    ]);
    // 行ごとの明細に、ほかの支払いが混ざらない
    const byId = new Map(ts.map((t) => [t.id, t]));
    for (const item of [...r.monthly, ...r.stopped]) {
      expect(new Set(item.ids.map((id) => -byId.get(id)!.amount))).toEqual(new Set([item.amount]));
    }
  });

  it('携帯料金の2回線のうち1回線を解約したら、その回線は「最近止まったもの」に出る（0.9.5）', () => {
    const ts = [
      latest,
      ...monthly('2025-01', '2026-11', 30, (_ym, i) => 2500 + ((i * 173) % 600), '架空テレコム利用料金'),
      ...monthly('2025-01', '2026-07', 30, (_ym, i) => 1200 + ((i * 59) % 300), '架空テレコム利用料金'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => [i.count, i.variable])).toEqual([[23, true]]);
    expect(r.stopped.map((i) => [i.lastYm, i.count])).toEqual([['2026-07', 19]]);
    const byId = new Map(ts.map((t) => [t.id, t]));
    expect(Math.max(...r.stopped[0].ids.map((id) => -byId.get(id)!.amount))).toBeLessThan(1500);
  });

  it('季節講習の月だけ2件ある、金額の毎月変わる支払い（塾など）は、分けずに1行で見る（0.9.5）', () => {
    // 毎月5日・金額は毎月大きく変わる。12月（と直近の夏）は26日にもう1件。2026-01 で止まった
    const juku = ymRange('2022-04', '2026-01').flatMap((ym, i) => {
      const r = [tx(`${ym}-05`, -(36000 + ((i * 37919) % 106000)), '架空ゼミ)ジユクヒヨウ', { large: '教養・教育', middle: '塾' })];
      if (ym.slice(5) === '12' || ym === '2025-07' || ym === '2025-08') {
        r.push(tx(`${ym}-26`, -(80000 + ((i * 7717) % 40000)), '架空ゼミ)ジユクヒヨウ', { large: '教養・教育', middle: '塾' }));
      }
      return r;
    });
    const r = findRecurring([latest, ...juku], none);
    expect(r.monthly).toEqual([]);
    expect(r.stopped.map((i) => [i.label, i.intervalMonths, i.lastYm, i.variable])).toEqual([['架空ゼミ)ジユクヒヨウ', 1, '2026-01', true]]);
    expect(r.stopped[0].ids).toHaveLength(juku.length);
  });

  it('1回あたり100円未満のもの（預金の利息から引かれる税金など）は出さない（0.9.5）', () => {
    const ts = [
      latest,
      ...monthly('2025-01', '2026-11', 18, (_ym, i) => 10 + (i % 5) * 4, '国税', { large: '税・社会保障', middle: '所得税・住民税' }),
      ...monthly('2025-01', '2026-11', 18, (_ym, i) => 3 + (i % 3), '地方税', { large: '税・社会保障', middle: '所得税・住民税' }),
      ...monthly('2025-01', '2026-11', 1, 100, '架空アプリ'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => i.label)).toEqual(['架空アプリ']);
    expect(r.stopped).toEqual([]);
  });

  it('2〜6か月ごとのものは金額が ±30% まで変わっても出す。毎年のものは ±10% のまま（0.9.5）', () => {
    const lesson = { large: '教養・教育', middle: '習いごと' };
    const ts = [
      latest,
      // 2か月ごと・コースで金額が変わる。2026-06 で止まった
      ...[['2025-04', 15400], ['2025-06', 15400], ['2025-08', 15400], ['2025-10', 15400], ['2025-12', 15400], ['2026-02', 15400], ['2026-04', 18700], ['2026-06', 17000]].map(([ym, a]) =>
        tx(`${ym}-06`, -a, '架空(スイミング', lesson),
      ),
      // 毎年・金額が ±10% を超えて変わる（同じ月の通販など）は出さない
      tx('2024-07-10', -5000, '架空ショップ', { large: '趣味・娯楽', middle: '本' }),
      tx('2025-07-10', -6200, '架空ショップ', { large: '趣味・娯楽', middle: '本' }),
      tx('2026-07-10', -5000, '架空ショップ', { large: '趣味・娯楽', middle: '本' }),
    ];
    const r = findRecurring(ts, none);
    expect(r.stopped.map((i) => [i.label, i.intervalMonths, i.amount, i.lastYm, i.count])).toEqual([['架空(スイミング', 2, 17000, '2026-06', 8]]);
    expect(r.periodic).toEqual([]);
  });

  it('前の名前とつなぐのは、次の月から同じ日ごろ・同じくらいの金額で始まったものが1つだけのとき', () => {
    const ts = [
      latest,
      ...monthly('2025-11', '2026-08', 7, 980, '架空音楽'),
      // 日が違う・金額が違うものは、つながない
      ...monthly('2026-09', '2026-11', 22, 980, '架空ニュース'),
      ...monthly('2026-09', '2026-11', 8, 3000, '架空学習'),
    ];
    const r = findRecurring(ts, none);
    expect(r.monthly.map((i) => i.label).sort()).toEqual(['架空ニュース', '架空学習']);
    expect(r.monthly.every((i) => i.previousLabel === undefined)).toBe(true);
    expect(r.stopped.map((i) => i.label)).toEqual(['架空音楽']);
  });

  it('収入・振替・計算対象外・除外した明細は使わない', () => {
    const excludedTs = monthly('2026-01', '2026-11', 1, 1000, '架空除外');
    const ts = [
      ...monthly('2026-01', '2026-11', 25, -300000, '架空給与'),
      ...monthly('2026-01', '2026-11', 27, 50000, '架空カード引き落とし', { isTransfer: true }),
      ...monthly('2026-01', '2026-11', 27, 2000, '架空対象外', { isTarget: false }),
      ...excludedTs,
    ];
    const excluded: ExclusionMap = new Map(excludedTs.map((t) => [t.id, ['r']]));
    const r = findRecurring(ts, excluded);
    expect([...r.monthly, ...r.periodic, ...r.stopped]).toEqual([]);
  });

  it('データがなければ空', () => {
    expect(findRecurring([], none)).toEqual({ latestYm: '', monthly: [], periodic: [], stopped: [], monthlyTotal: 0 });
  });
});
