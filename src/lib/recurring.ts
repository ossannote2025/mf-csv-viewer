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
  /** 月 → その月の合計・回数・日 */
  months: Map<string, { amount: number; count: number; days: number[] }>;
  last: Transaction;
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
  const nearCount = (usual: number) =>
    firstDays.filter((d) => {
      const diff = Math.abs(d - usual);
      return Math.min(diff, 31 - diff) <= DAY_TOLERANCE;
    }).length;
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
  const groups = new Map<string, Group>();
  let latestYm = '';
  for (const t of transactions) {
    if (t.ym > latestYm) latestYm = t.ym;
    if (t.amount >= 0 || t.isTransfer || !t.isTarget || excluded.has(t.id)) continue;
    if (NON_FIXED_CATEGORIES.has(t.large) || NON_FIXED_MIDDLE_CATEGORIES.has(`${t.large}/${t.middle}`)) continue;
    const key = recurringKey(t.content);
    if (key.length < 2) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, months: new Map(), last: t }));
    if (t.date > g.last.date) g.last = t;
    let m = g.months.get(t.ym);
    if (!m) g.months.set(t.ym, (m = { amount: 0, count: 0, days: [] }));
    m.amount += -t.amount;
    m.count++;
    m.days.push(Number(t.date.slice(8, 10)));
  }

  const monthly: RecurringItem[] = [];
  const periodic: RecurringItem[] = [];
  const stopped: RecurringItem[] = [];
  for (const g of groups.values()) {
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
