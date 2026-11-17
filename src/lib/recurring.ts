import { shiftYm } from './date';
import { ymRange } from './series';
import type { ExclusionMap, Transaction } from './types';

/**
 * 固定費・定期支払いの検出（提案④。0.9.0）。
 * 同じ内容の支出が毎月・数か月ごと・毎年出ているものを見つける。データの形は変えず、表示のたびに計算する。
 * 基準の月は今日ではなく、データの最新の月（CSV を取り込んでいない間に、すべてが「止まった」にならないように）
 */

/** 「毎月」とみなす連続月数の下限（ユーザーと相談して 3 か月に決定） */
export const MIN_MONTHLY_RUN = 3;
/** 値上げ・値下げとみなす変化の割合 */
const PRICE_CHANGE_RATIO = 0.05;
/** 「金額が安定している」とみなす揺れの割合 */
const STABLE_RATIO = 0.02;
/** 「最近止まったもの」に出す期間（最新の月から何か月前までに止まったものか） */
const STOPPED_WITHIN_MONTHS = 12;
/** 数か月ごと・毎年のものとみなす金額の揺れ（0.9.1 で ±30% → ±10%。年ごとに金額の違う買い物を拾わないため） */
const PERIODIC_AMOUNT_RATIO = 0.1;
/** 毎月のもの：いつもの日から何日以内なら「同じ日」とみなすか */
const DAY_TOLERANCE = 5;
/** 毎月のもの：いつもの日に出た月が何割以上なら固定費とみなすか */
const DAY_MATCH_RATIO = 0.8;
/**
 * 固定費の候補にしない大項目（0.9.1。ユーザーと相談して決定）。
 * たまたま毎月同じ店で食事した・同じ電車に乗った・ATM の手数料がかかった、などを拾わないため
 */
export const NON_FIXED_CATEGORIES = new Set(['食費', '日用品', '交通費', '衣服・美容', '交際費', '現金・カード', '特別な支出']);
/**
 * 固定費の候補にしない「大項目/中項目」（0.9.2）。使った分だけかかるもの。
 * 毎月同じころに給油すると固定費に出たとのユーザーの報告で決定（洗車もガソリンに入れているとのこと）。
 * 同じ大項目の駐車場・自動車保険・ローンなどは固定費なので、大項目ごとは外さない
 */
export const NON_FIXED_MIDDLE_CATEGORIES = new Set(['自動車/ガソリン', '自動車/道路料金']);
/** 数か月ごとの支払いとみなす間隔 */
const PERIODIC_INTERVALS = [2, 3, 4, 6, 12];

export interface RecurringPoint {
  ym: string;
  amount: number;
}

export interface RecurringItem {
  key: string;
  /** 直近の明細の内容 */
  label: string;
  /** 直近の明細の支払い元 */
  institution: string;
  /** 1：毎月。2〜12：数か月ごと・毎年 */
  intervalMonths: number;
  /** 直近の金額（正の数）。金額が毎月変わるものは平均 */
  amount: number;
  /** 金額が毎月変わるもの（電気・ガスなど）。「¥8,200 前後」と表示する */
  variable: boolean;
  /** 月あたりの金額（見込みの合計に使う） */
  monthlyCost: number;
  /** 毎月：続いている月数。数か月ごと：続いている回数 */
  count: number;
  /** よく引き落とされる日（直近3回の中央値） */
  day: number;
  /** 毎年のものの月（1〜12） */
  month: number;
  lastYm: string;
  /** 小さな棒グラフ用。毎月は直近12か月（ないときは 0）、数か月ごとは直近の回 */
  history: RecurringPoint[];
  /** 直近6か月以内の値上げ・値下げ */
  priceChange?: { from: number; to: number; ym: string };
  /** 途中で内容の書き方が変わったときの、前の書き方（0.9.2） */
  previousLabel?: string;
  /** この行にまとめた明細の ID（タップで明細一覧に出す。0.9.3） */
  ids: string[];
}

export interface RecurringResult {
  /** データの最新の月 */
  latestYm: string;
  monthly: RecurringItem[];
  periodic: RecurringItem[];
  stopped: RecurringItem[];
  /** 今も続いているものの月あたりの合計（見込み） */
  monthlyTotal: number;
}

/** 内容をまとめるためのキー：全角・半角・大文字小文字・空白・記号・数字（「10月分」など）の違いを無視する */
export function recurringKey(content: string): string {
  return content
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\d\s\p{P}\p{S}]/gu, '')
    .replace(/(年|月|日|分)+$/u, '');
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const isStable = (xs: number[]) => {
  if (xs.length === 0) return false;
  const m = median(xs);
  return xs.every((x) => Math.abs(x - m) <= m * STABLE_RATIO);
};

const monthDiff = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

interface Group {
  key: string;
  /** 金額で分ける前のキー（同じ名前で金額の違う支払いを、名前が変わったものとして続けるため） */
  baseKey: string;
  txs: Transaction[];
  /** 月 → その月の合計・回数・日 */
  months: Map<string, { amount: number; count: number; days: number[] }>;
  last: Transaction;
}

/**
 * 光熱費は、内容ではなく中項目でまとめる（0.9.2）。ガス会社などの書き方が変わっても続けて数えるため。
 * 「光熱費」「その他…」のように種類の分からない中項目は、内容でまとめる
 */
const UTILITY_LARGE = '水道・光熱費';
const GENERIC_MIDDLES = new Set(['光熱費', 'その他水道・光熱費', '未分類', 'その他']);

function groupKey(t: Transaction): string {
  if (t.large === UTILITY_LARGE && !GENERIC_MIDDLES.has(t.middle)) return `u|${t.middle}`;
  return recurringKey(t.content);
}

function makeGroup(key: string, baseKey: string, txs: Transaction[]): Group {
  const months: Group['months'] = new Map();
  let last = txs[0];
  for (const t of txs) {
    if (t.date > last.date) last = t;
    let m = months.get(t.ym);
    if (!m) months.set(t.ym, (m = { amount: 0, count: 0, days: [] }));
    m.amount += -t.amount;
    m.count++;
    m.days.push(Number(t.date.slice(8, 10)));
  }
  return { key, baseKey, txs, months, last };
}

/**
 * 同じ名前で毎月2回以上あるもの（例：同じ請求名の2つのサブスク・家族2人分の携帯料金）は、支払いごとに分ける（0.9.2）。
 * 光熱費（中項目でまとめたもの）は分けない。
 *
 * 0.9.4：金額が毎月変わるもの（通話料で変わる携帯料金など）も分けられるように、金額の近さ（±2%）ではなく、
 * 新しい月から古い月へたどって、前の月の明細を「同じ支払い」につなぐ。
 * 0.9.5：0.9.4 は件数の同じ月を金額の順番でつないでいたため、途中で止まった支払いが残りの支払いに混ざり、
 * 「最近止まったもの」に出なくなった。各月の明細を、金額（±30%）と日（±5日）の近いものから順につなぎ、
 * つなぐ先のない明細は別の支払いとして数える。
 * 2本の金額が近く、月によって大小が入れ替わると混ざる（合計は合う。ユーザーが了承）
 */
function splitByAmount(key: string, txs: Transaction[]): Group[] {
  const byMonth = new Map<string, Transaction[]>();
  for (const t of txs) byMonth.set(t.ym, [...(byMonth.get(t.ym) ?? []), t]);
  const yms = [...byMonth.keys()].sort().reverse();
  // 以前は月1件で、途中から2件になったものも分ける（直近12か月でも見る）
  const multiRatio = (list: string[]) => list.filter((ym) => byMonth.get(ym)!.length > 1).length / list.length;
  if (key.startsWith('u|') || Math.max(multiRatio(yms), multiRatio(yms.slice(0, 12))) <= 0.2) return [makeGroup(key, key, txs)];

  const tracks: Track[] = [];
  for (const ym of yms) {
    const items = byMonth.get(ym)!;
    const pairs: { t: Transaction; tr: Track; diff: number }[] = [];
    for (const t of items) {
      for (const tr of tracks) {
        const diff = amountDiff(-t.amount, tr.amount);
        if (diff <= TRACK_AMOUNT_RATIO && dayDistance(day(t), tr.day) <= DAY_TOLERANCE) pairs.push({ t, tr, diff });
      }
    }
    pairs.sort((x, y) => x.diff - y.diff || dayDistance(day(x.t), x.tr.day) - dayDistance(day(y.t), y.tr.day));
    const usedT = new Set<Transaction>();
    const usedTr = new Set<Track>();
    const attach = (t: Transaction, tr: Track) => {
      usedT.add(t);
      usedTr.add(tr);
      tr.txs.push(t);
      tr.amount = -t.amount;
      tr.day = day(t);
    };
    for (const { t, tr } of pairs) if (!usedT.has(t) && !usedTr.has(tr)) attach(t, tr);
    // つなぐ先のない明細は、別の支払い（金額の大きい順に並べる）
    for (const t of [...items].sort((x, y) => x.amount - y.amount)) {
      if (usedT.has(t)) continue;
      const tr: Track = { txs: [], amount: 0, day: 0 };
      tracks.push(tr);
      attach(t, tr);
    }
  }
  if (tracks.length === 1) return [makeGroup(key, key, txs)];
  return tracks.map((tr, i) => makeGroup(`${key}#${i}`, key, tr.txs));
}

interface Track {
  txs: Transaction[];
  /** つないだ明細のうち、いちばん古い月の金額（正の数）と日 */
  amount: number;
  day: number;
}
/** 同じ支払いとしてつなぐ、前の月との金額の違い（大きいほうに対する割合。0.9.5） */
const TRACK_AMOUNT_RATIO = 0.3;
const day = (t: Transaction) => Number(t.date.slice(8, 10));
const amountDiff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1);

const dayDistance = (a: number, b: number) => {
  const diff = Math.abs(a - b);
  return Math.min(diff, 31 - diff);
};

/**
 * 内容の書き方が変わった毎月の支払いを、前の書き方とつなぐ（0.9.2）。
 * 前の書き方が止まった次の月から、同じ日ごろ（±5日）・同じくらいの金額（±10%。もとが同じ名前なら金額は問わない）で
 * 始まったものが1つだけあれば、同じ支払いとみなす
 */
function linkRenamed(groups: Group[], latestYm: string): Group[] {
  const byFirst = new Map<string, Group[]>();
  const firstOf = (g: Group) => [...g.months.keys()].sort()[0];
  for (const g of groups) {
    const f = firstOf(g);
    byFirst.set(f, [...(byFirst.get(f) ?? []), g]);
  }
  const merged = new Set<Group>();
  const result: Group[] = [];
  // 古いものから順に見る（A→B→C と2回変わっても1つにつなぐ）
  const ordered = [...groups].sort((a, b) => (firstOf(a) < firstOf(b) ? -1 : 1));
  for (const g of ordered) {
    if (merged.has(g)) continue;
    let cur = g;
    for (;;) {
      if (!asMonthly(cur, [...cur.months.keys()].sort(), latestYm)) break;
      const lastYm = [...cur.months.keys()].sort().at(-1)!;
      const lastAmount = cur.months.get(lastYm)!.amount;
      const lastDay = Math.min(...cur.months.get(lastYm)!.days);
      const next = (byFirst.get(shiftYm(lastYm, 1)) ?? []).filter((b) => {
        if (b === cur || merged.has(b)) return false;
        const m = b.months.get(firstOf(b))!;
        if (m.count !== 1 || dayDistance(Math.min(...m.days), lastDay) > DAY_TOLERANCE) return false;
        return b.baseKey === cur.baseKey || Math.abs(m.amount - lastAmount) <= lastAmount * PERIODIC_AMOUNT_RATIO;
      });
      if (next.length !== 1) break;
      merged.add(next[0]);
      cur = makeGroup(next[0].key, next[0].baseKey, [...cur.txs, ...next[0].txs]);
    }
    result.push(cur);
  }
  return result;
}

/** 続いている期間のうち、最後の書き方と違う、いちばん新しい書き方 */
function previousLabelOf(g: Group, run: string[]): string | undefined {
  const lastKey = recurringKey(g.last.content);
  const inRun = new Set(run);
  let prev: Transaction | undefined;
  for (const t of g.txs) {
    if (!inRun.has(t.ym) || recurringKey(t.content) === lastKey) continue;
    if (!prev || t.date > prev.date) prev = t;
  }
  return prev?.content;
}

/**
 * 直近の金額が、それまでの安定した金額から変わったか（直近6か月以内）。
 * 変わる前・変わった後がそれぞれ安定しているときだけ（毎月変わるものには出さない）
 */
function findPriceChange(points: RecurringPoint[], latestYm: string): RecurringItem['priceChange'] {
  for (let i = points.length - 1; i >= 2; i--) {
    const after = points.slice(i).map((p) => p.amount);
    const before = points.slice(Math.max(0, i - 3), i).map((p) => p.amount);
    if (!isStable(after)) return undefined;
    if (before.length < 2 || !isStable(before)) continue;
    const from = median(before);
    const to = median(after);
    if (Math.abs(to - from) < from * PRICE_CHANGE_RATIO) continue;
    if (monthDiff(points[i].ym, latestYm) > 6) return undefined;
    return { from, to, ym: points[i].ym };
  }
  return undefined;
}

function baseItem(g: Group, intervalMonths: number, occ: string[]): Omit<RecurringItem, 'amount' | 'variable' | 'monthlyCost' | 'count' | 'history'> {
  const days = occ.slice(-3).flatMap((ym) => g.months.get(ym)!.days);
  const lastYm = occ[occ.length - 1];
  return {
    key: g.key,
    label: g.last.content,
    institution: g.last.institution,
    intervalMonths,
    day: Math.round(median(days)),
    month: Number(lastYm.slice(5, 7)),
    lastYm,
    previousLabel: previousLabelOf(g, occ),
    ids: g.txs.map((t) => t.id),
  };
}

/** 毎月のもの：最後に出た月で終わる、連続した月の並びが3か月以上で、ほぼ月1回 */
function asMonthly(g: Group, occ: string[], latestYm: string): RecurringItem | undefined {
  let start = occ.length - 1;
  while (start > 0 && monthDiff(occ[start - 1], occ[start]) === 1) start--;
  const run = occ.slice(start);
  if (run.length < MIN_MONTHLY_RUN) return undefined;
  // 月に2回以上の月が2割を超えるもの（スーパーなど、ふだんの買い物）は外す
  const multi = run.filter((ym) => g.months.get(ym)!.count > 1).length;
  if (multi > run.length * 0.2) return undefined;
  // 引き落とされる日がそろっている（いつもの日 ±5日に8割以上の月）。日がばらばらな食事・電車などを外す（0.9.1）
  // 月末と月初をまたぐ（30日・2日など）ので、日の差は月をまたいで測り、いつもの日は「近い月がいちばん多い日」にする
  const firstDays = run.map((ym) => Math.min(...g.months.get(ym)!.days));
  const nearCount = (usual: number) => firstDays.filter((d) => dayDistance(d, usual) <= DAY_TOLERANCE).length;
  if (Math.max(...firstDays.map(nearCount)) < run.length * DAY_MATCH_RATIO) return undefined;

  const points = run.map((ym) => ({ ym, amount: g.months.get(ym)!.amount }));
  const priceChange = findPriceChange(points, latestYm);
  // 直近3か月の金額が揃っていないもの（値上げの直後は除く）は、毎月金額が変わるもの
  const variable = !priceChange && !isStable(points.slice(-3).map((p) => p.amount));
  const amount = variable ? Math.round(points.slice(-12).reduce((a, p) => a + p.amount, 0) / Math.min(points.length, 12)) : points[points.length - 1].amount;
  const historyEnd = run[run.length - 1] < latestYm ? latestYm : run[run.length - 1];
  return {
    ...baseItem(g, 1, run),
    amount,
    variable,
    monthlyCost: amount,
    count: run.length,
    history: ymRange(shiftYm(historyEnd, -11), historyEnd).map((ym) => ({ ym, amount: g.months.get(ym)?.amount ?? 0 })),
    priceChange,
  };
}

/**
 * 数か月ごと・毎年のもの：同じ間隔で続いている（毎年は2回以上、それより短い間隔は4回以上）。
 * 毎回1件だけで、金額が近い（±10%）。たまたま同じ間隔になったふだんの買い物を拾わないため
 */
function asPeriodic(g: Group, occ: string[]): RecurringItem | undefined {
  if (occ.length < 2) return undefined;
  const interval = monthDiff(occ[occ.length - 2], occ[occ.length - 1]);
  if (!PERIODIC_INTERVALS.includes(interval)) return undefined;
  let start = occ.length - 2;
  while (start > 0 && monthDiff(occ[start - 1], occ[start]) === interval) start--;
  const run = occ.slice(start);
  if (run.length < (interval === 12 ? 2 : 4)) return undefined;
  if (run.some((ym) => g.months.get(ym)!.count > 1)) return undefined;

  const points = run.map((ym) => ({ ym, amount: g.months.get(ym)!.amount }));
  const mid = median(points.map((p) => p.amount));
  if (points.some((p) => Math.abs(p.amount - mid) > mid * PERIODIC_AMOUNT_RATIO)) return undefined;
  const amount = points[points.length - 1].amount;
  return {
    ...baseItem(g, interval, run),
    amount,
    variable: false,
    monthlyCost: amount / interval,
    count: run.length,
    history: points.slice(-12),
  };
}

/** 固定費・定期支払いを見つける。支出だけ（振替・計算対象外・除外した明細・食費などの大項目は使わない） */
export function findRecurring(transactions: Iterable<Transaction>, excluded: ExclusionMap): RecurringResult {
  const byKey = new Map<string, Transaction[]>();
  let latestYm = '';
  for (const t of transactions) {
    if (t.ym > latestYm) latestYm = t.ym;
    if (t.amount >= 0 || t.isTransfer || !t.isTarget || excluded.has(t.id)) continue;
    if (NON_FIXED_CATEGORIES.has(t.large) || NON_FIXED_MIDDLE_CATEGORIES.has(`${t.large}/${t.middle}`)) continue;
    const key = groupKey(t);
    if (key.length < 2) continue;
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }
  const groups = linkRenamed(
    [...byKey.entries()].flatMap(([key, txs]) => splitByAmount(key, txs)),
    latestYm,
  );

  const monthly: RecurringItem[] = [];
  const periodic: RecurringItem[] = [];
  const stopped: RecurringItem[] = [];
  for (const g of groups) {
    const occ = [...g.months.keys()].sort();
    const item = asMonthly(g, occ, latestYm) ?? asPeriodic(g, occ);
    if (!item) continue;
    // 次に出るはずの月の翌月を過ぎても出ていなければ「止まった」（今月は途中のことがあるので1か月待つ）
    const gap = monthDiff(item.lastYm, latestYm);
    if (gap > item.intervalMonths) {
      if (gap - item.intervalMonths <= STOPPED_WITHIN_MONTHS) stopped.push(item);
    } else if (item.intervalMonths === 1) monthly.push(item);
    else periodic.push(item);
  }

  monthly.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'ja'));
  periodic.sort((a, b) => b.monthlyCost - a.monthlyCost || a.label.localeCompare(b.label, 'ja'));
  stopped.sort((a, b) => (a.lastYm < b.lastYm ? 1 : a.lastYm > b.lastYm ? -1 : b.amount - a.amount));
  const monthlyTotal = Math.round([...monthly, ...periodic].reduce((a, i) => a + i.monthlyCost, 0));
  return { latestYm, monthly, periodic, stopped, monthlyTotal };
}
