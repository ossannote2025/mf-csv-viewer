import { shiftYm } from './date';
import { formatYen } from './format';
import { ymRange } from './series';
import type { ExclusionMap, RecurringChoice, Transaction } from './types';

/**
 * 固定費の候補（0.10.0 で作り直し）。
 * 0.9.x は金額・日・間隔の条件で自動で判定していたが、条件を足すたびに別の支払いが外れたため、
 * 「同じ名前で定期的に出ている支出」をゆるく候補に出し、固定費かどうかはユーザーが選ぶ形にした（ユーザーと相談して決定）。
 * 基準の月は今日ではなく、データの最新の月
 */

/** 候補にする：最後に出た月までの12か月のうち、何か月以上に出ているか */
export const MIN_MONTHS = 3;
/**
 * 最後に出た月から何か月たつと「止まったもの」にするか（2か月ごと・3か月ごとの支払いが、途中の今月で止まったことにならないように 4）。
 * 0.10.3：これは最短。直近24か月でいちばん長かった間隔がこれより長いもの（6・7・9・12月の固定資産税は 12月→6月 の6か月）は、
 * その間隔を過ぎても出ていないときに止まったものにする
 */
export const STOPPED_AFTER_MONTHS = 4;
/**
 * 候補にしない大項目（0.9.1。ユーザーと相談して決定）。
 * 毎月行くスーパー・コンビニ・電車などが大量に候補に出るのを防ぐ
 */
export const NON_FIXED_CATEGORIES = new Set(['食費', '日用品', '交通費', '衣服・美容', '交際費', '現金・カード', '特別な支出']);
/** 候補にしない「大項目/中項目」（0.9.2）。使った分だけかかるもの（駐車場・自動車保険などは残す） */
export const NON_FIXED_MIDDLE_CATEGORIES = new Set(['自動車/ガソリン', '自動車/道路料金']);

export interface RecurringPoint {
  ym: string;
  amount: number;
}

export interface RecurringItem {
  /** 名前（`groupKey`。同じ金額の年1回は「名前|金額」）。固定費かどうかの選択はこのキーで保存する */
  key: string;
  /** 直近の明細の内容（同じ金額の年1回は「内容（¥34,500）」） */
  label: string;
  /** 直近の明細の支払い元・大項目 */
  institution: string;
  large: string;
  /** regular：12か月のうち3か月以上。yearly：2年続けて同じ月ごろに1回 */
  kind: 'regular' | 'yearly';
  /** regular：最後に出た月までの12か月のうち、出た月の数。yearly：続いた年数 */
  count: number;
  /** 月あたりの金額。regular：最後に出た月までの12か月の合計 ÷ 12。yearly：直近の年の金額 ÷ 12 */
  monthlyCost: number;
  /** regular：最後に出た月までの12か月の合計。yearly：直近の年の金額 */
  yearlyAmount: number;
  lastYm: string;
  /** 最近止まったもの（regular：最後に出た月から4か月以上。yearly：次に出るはずの月を1か月過ぎた） */
  stopped: boolean;
  /** 同じ金額の年1回の候補のとき、もとの名前の候補のキー（名前の候補を固定費に入れたら出さない。0.10.3） */
  parentKey?: string;
  /** 小さな棒グラフ用：最後に出た月（止まっていなければデータの最新の月）までの12か月 */
  history: RecurringPoint[];
  /** この候補にまとめた明細の ID（タップで明細一覧に出す） */
  ids: string[];
}

/** 内容をまとめるためのキー：全角・半角・大文字小文字・空白・記号・数字（「10月分」など）の違いを無視する */
export function recurringKey(content: string): string {
  return content
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\d\s\p{P}\p{S}]/gu, '')
    .replace(/(年度|年|月|日|分)+$/u, '');
}

/**
 * 光熱費は、内容ではなく中項目でまとめる（0.9.2）。ガス会社などの請求名が変わっても1つの候補にするため。
 * 「光熱費」「その他…」のように種類の分からない中項目は、内容でまとめる
 */
const UTILITY_LARGE = '水道・光熱費';
const GENERIC_MIDDLES = new Set(['光熱費', 'その他水道・光熱費', '未分類', 'その他']);

export function groupKey(t: Transaction): string {
  if (t.large === UTILITY_LARGE && !GENERIC_MIDDLES.has(t.middle)) return `u|${t.middle}`;
  return recurringKey(t.content);
}

const monthDiff = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** ym の 11〜13 か月前に出ている月（年1回の前の年） */
const yearBefore = (ym: string, months: Map<string, number>) => [12, 11, 13].map((n) => shiftYm(ym, -n)).find((y) => months.has(y));

function toItem(key: string, txs: Transaction[], latestYm: string, labelSuffix = ''): RecurringItem | undefined {
  const byMonth = new Map<string, number>();
  let last = txs[0];
  for (const t of txs) {
    byMonth.set(t.ym, (byMonth.get(t.ym) ?? 0) - t.amount);
    if (t.date > last.date) last = t;
  }
  const lastYm = last.ym;
  const inWindow = ymRange(shiftYm(lastYm, -11), lastYm).filter((ym) => byMonth.has(ym));
  const sinceLast = monthDiff(lastYm, latestYm);
  // いつもの最長の間隔を過ぎても出ていなければ止まったもの。最短は STOPPED_AFTER_MONTHS。
  // 間隔は24か月で測る（12か月だと、12月で終わる年の「12月→翌年6月」の間隔が入らないため）
  const recent = ymRange(shiftYm(lastYm, -23), lastYm).filter((ym) => byMonth.has(ym));
  const longestGap = Math.max(0, ...recent.slice(1).map((ym, i) => monthDiff(recent[i], ym)));
  const regularStopped = sinceLast >= Math.max(STOPPED_AFTER_MONTHS, longestGap + 1);
  const historyEnd = !regularStopped ? latestYm : lastYm;
  const base = {
    key,
    label: last.content + labelSuffix,
    institution: last.institution,
    large: last.large,
    lastYm,
    history: ymRange(shiftYm(historyEnd, -11), historyEnd).map((ym) => ({ ym, amount: byMonth.get(ym) ?? 0 })),
    ids: txs.map((t) => t.id),
  };

  if (inWindow.length >= MIN_MONTHS) {
    // 直近12か月に出ていないもの（ずっと前に止まったもの）は出さない
    if (sinceLast >= 12) return undefined;
    const total = inWindow.reduce((a, ym) => a + byMonth.get(ym)!, 0);
    return { ...base, kind: 'regular', count: inWindow.length, monthlyCost: total / 12, yearlyAmount: total, stopped: regularStopped };
  }

  // 年1回：最後に出た月の 11〜13 か月前にも出ていて、その間には出ていない
  if (inWindow.length !== 1 || !yearBefore(lastYm, byMonth)) return undefined;
  // 次に出るはずの月（12か月後）を1か月過ぎても出ていなければ止まったもの。それより1年以上前に止まったものは出さない
  if (sinceLast > 24) return undefined;
  let years = 1;
  for (let ym: string | undefined = lastYm; (ym = yearBefore(ym, byMonth)); ) years++;
  const amount = byMonth.get(lastYm)!;
  return { ...base, kind: 'yearly', count: years, monthlyCost: amount / 12, yearlyAmount: amount, stopped: sinceLast > 13 };
}

/**
 * 同じ名前・まったく同じ金額の年1回の支払い（0.10.2。ユーザーと相談して決定）。
 * 「セブン-イレブン 支払」のように1つの名前でいろいろ払っていても、毎年5月の ¥34,500（自動車税）を別の候補として見つけるため。
 * 名前の候補がすでに年1回のときは、同じものが2つ出ないように使わない。毎月同じ金額のものは年1回にならないので出ない
 */
function sameAmountYearly(key: string, txs: Transaction[], latestYm: string): RecurringItem[] {
  const byAmount = new Map<number, Transaction[]>();
  for (const t of txs) byAmount.set(t.amount, [...(byAmount.get(t.amount) ?? []), t]);
  const out: RecurringItem[] = [];
  for (const [amount, list] of byAmount) {
    if (list.length < 2) continue;
    const item = toItem(`${key}|${-amount}`, list, latestYm, `（${formatYen(-amount)}）`);
    if (item?.kind === 'yearly') out.push({ ...item, parentKey: key });
  }
  return out;
}

/** 固定費の候補を見つける。支出だけ（振替・計算対象外・除外した明細・食費などの大項目は使わない） */
export function findRecurring(transactions: Iterable<Transaction>, excluded: ExclusionMap): { latestYm: string; items: RecurringItem[] } {
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
  const items: RecurringItem[] = [];
  for (const [key, txs] of byKey) {
    const item = toItem(key, txs, latestYm);
    if (item) items.push(item);
    if (item?.kind !== 'yearly') items.push(...sameAmountYearly(key, txs, latestYm));
  }
  items.sort((a, b) => b.monthlyCost - a.monthlyCost || a.label.localeCompare(b.label, 'ja'));
  return { latestYm, items };
}

export interface RecurringCategory {
  large: string;
  items: RecurringItem[];
  /** 月あたりの小計 */
  monthlyTotal: number;
}

export interface RecurringGroups {
  /** 固定費に入れたもの（止まっていないもの）を大項目ごとに。小計の大きい順 */
  fixed: RecurringCategory[];
  /** 最近止まったもの（固定費に入れたものと未確認のもの。合計に入れない。0.10.1 で未確認のものも出すようにした） */
  stopped: RecurringItem[];
  /** まだ選んでいない候補（止まっていないものだけ） */
  undecided: RecurringItem[];
  /** 固定費ではないとしたもの */
  notFixed: RecurringItem[];
  /** 固定費の合計（月あたり。止まったものは入れない） */
  monthlyTotal: number;
}

/** 候補を、ユーザーの選択で分ける */
export function groupByChoice(items: RecurringItem[], choices: RecurringChoice[]): RecurringGroups {
  const choiceOf = new Map(choices.map((c) => [c.key, c.choice]));
  const byLarge = new Map<string, RecurringItem[]>();
  const g: RecurringGroups = { fixed: [], stopped: [], undecided: [], notFixed: [], monthlyTotal: 0 };
  for (const item of items) {
    // 名前の候補を固定費に入れたら、その名前の「（金額）」の候補は出さない（二重に数えないため。0.10.3）
    if (item.parentKey && choiceOf.get(item.parentKey) === 'fixed') continue;
    const choice = choiceOf.get(item.key);
    if (choice === 'notFixed') g.notFixed.push(item);
    else if (item.stopped) g.stopped.push(item);
    else if (choice === 'fixed') byLarge.set(item.large, [...(byLarge.get(item.large) ?? []), item]);
    else g.undecided.push(item);
  }
  // 最近止まったものは、止まったのが新しい順
  g.stopped.sort((a, b) => (a.lastYm < b.lastYm ? 1 : a.lastYm > b.lastYm ? -1 : b.monthlyCost - a.monthlyCost));
  g.fixed = [...byLarge.entries()]
    .map(([large, list]) => ({ large, items: list, monthlyTotal: list.reduce((a, i) => a + i.monthlyCost, 0) }))
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal || a.large.localeCompare(b.large, 'ja'));
  g.monthlyTotal = Math.round(g.fixed.reduce((a, c) => a + c.monthlyTotal, 0));
  return g;
}
