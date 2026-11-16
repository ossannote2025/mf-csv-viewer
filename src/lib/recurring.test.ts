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
      ...monthly('2026-01', '2026-11', 5, 3000, '架空スーパー'),
      ...monthly('2026-01', '2026-11', 20, 2500, '架空スーパー'),
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
