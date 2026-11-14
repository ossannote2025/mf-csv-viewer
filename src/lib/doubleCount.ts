/**
 * 二重計上の候補を見つける。
 * - カード引き落とし：銀行など（カード以外）の支出で、振替になっていないカードの引き落とし
 * - 重複購入：通販サイトとカードの両方から入った同じ買い物
 * アプリは自動では除外しない。候補を見せて、ユーザーが除外ルールを作るか「二重ではない」を選ぶ。
 */
import { formatDateFull } from './date';
import { formatYen } from './format';
import type { DismissedCandidate, ExclusionMap, RuleConditions, Transaction } from './types';

// ---------------------------------------------------------------------------
// 文字の正規化

const nameCache = new Map<string, string>();

/**
 * 照合用の正規化：
 * NFKC（半角カナ→全角、全角英数→半角）、小文字、ひらがな→カタカナ、
 * カタカナの後の「-」は長音に、空白・記号は削除。
 */
export function normalizeName(s: string): string {
  const hit = nameCache.get(s);
  if (hit !== undefined) return hit;
  let n = s.normalize('NFKC').toLowerCase();
  n = n.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  n = n.replace(/([ァ-ヺ])[-‐‑–—―−－]/g, '$1ー');
  n = n.replace(/[^\p{L}\p{N}ー]/gu, '');
  if (nameCache.size > 50000) nameCache.clear();
  nameCache.set(s, n);
  return n;
}

const norm = (list: string[]) => list.map(normalizeName);

// ---------------------------------------------------------------------------
// キーワード・辞書

/**
 * 引き落としならではの言葉（A：これだけで候補にする）。
 * 「カード」だけでは候補にしない（「○○カード」という商品名などの買い物があるため）
 */
const WITHDRAWAL_WORDS = norm(['引落', '引き落とし', 'ひきおとし', 'ヒキオトシ', '口座振替', '利用代金', 'クレジット', 'credit']);
/** 「カード」を表す言葉（カードの名前と結び付いたときだけ手がかりにする） */
const CARD_WORDS = norm(['カード', 'card']);
/** 引き落としではないもの（ローン返済・デビットなど） */
const NOT_WITHDRAWAL_WORDS = norm(['デビット', 'debit', 'ローン', 'loan', 'キャッシング', '年会費']);

/** 金融機関名が銀行らしい言葉（引き落とし口座はこれらに限る） */
const BANK_INSTITUTION_WORDS = norm([
  '銀行', 'ぎんこう', 'ギンコウ', '信用金庫', '信金', '信用組合', '信組', '労働金庫', '労金', 'ろうきん', 'ゆうちょ', 'ユウチョ',
  'jaバンク', '農協', '農業協同組合', 'bank',
]);

/** 金融機関名がカードらしい言葉 */
const CARD_INSTITUTION_WORDS = norm([
  'カード', 'card', 'クレジット', 'credit', 'vpass', 'jcb', 'アメックス', 'amex', 'americanexpress', 'ダイナース', 'diners',
  'ニコス', 'nicos', 'セゾン', 'saison', 'エポス', 'epos', 'オリコ', 'orico', 'ジャックス', 'jaccs', 'セディナ', 'cedyna',
]);

/** カード会社の辞書（B）。漢字・カタカナ・ローマ字の別名を同じカード会社として扱う */
const CARD_COMPANIES: { name: string; aliases: string[] }[] = [
  { name: '楽天カード', aliases: ['楽天', 'ラクテン', 'rakuten'] },
  { name: '三井住友カード', aliases: ['三井住友', 'ミツイスミトモ', 'smbc', 'smcc', 'vpass'] },
  { name: '三菱UFJニコス', aliases: ['ニコス', 'nicos', '三菱ufj', 'ミツビシufj', 'mufg'] },
  { name: 'JCB', aliases: ['jcb', 'ジェーシービー'] },
  { name: 'セゾンカード', aliases: ['セゾン', 'saison'] },
  { name: 'イオンカード', aliases: ['イオン', 'aeon'] },
  { name: 'エポスカード', aliases: ['エポス', 'epos', 'マルイ', '丸井'] },
  { name: 'ビューカード', aliases: ['ビューカード', 'viewcard', 'ビユーカード'] },
  { name: 'オリコ', aliases: ['オリコ', 'orico', 'オリエントコーポレーション'] },
  { name: 'ジャックス', aliases: ['ジャックス', 'jaccs'] },
  { name: 'アメリカン・エキスプレス', aliases: ['アメックス', 'amex', 'アメリカンエキスプレス', 'americanexpress'] },
  { name: 'ダイナースクラブ', aliases: ['ダイナース', 'diners'] },
  { name: 'PayPayカード', aliases: ['paypay', 'ペイペイ', 'ワイジエイカード', 'ワイジェイカード', 'yjカード', 'yjcard'] },
  { name: 'dカード', aliases: ['dカード', 'dcard', 'ドコモ', 'docomo'] },
  { name: 'au PAY カード', aliases: ['aupay', 'auペイ', 'エーユーペイ'] },
  { name: 'ライフカード', aliases: ['ライフカード', 'lifecard'] },
  { name: 'セディナ', aliases: ['セディナ', 'cedyna'] },
  { name: 'UCSカード', aliases: ['ucs', 'ユーシーエス'] },
  { name: 'アプラス', aliases: ['アプラス', 'aplus'] },
  { name: 'ポケットカード', aliases: ['ポケットカード', 'pocketcard'] },
  { name: 'エムアイカード', aliases: ['エムアイカード', 'micard'] },
  { name: '東急カード', aliases: ['東急', 'トウキユウ', 'トウキュウ'] },
].map((c) => ({ name: c.name, aliases: norm(c.aliases) }));

/** 金融機関名からカード会社の手がかりを取り出すときに取り除く共通語（C） */
const GENERIC_WORDS = norm([
  'カード', 'card', 'クレジット', 'credit', '株式会社', 'カブシキガイシャ', 'サービス', 'service', 'visa', 'mastercard',
  'master', 'ゴールド', 'gold', 'プラチナ', 'platinum', 'ビジネス', 'business', 'クラシック', 'classic', '公式',
]).sort((a, b) => b.length - a.length);

/** 通販サイトらしい言葉 */
const EC_WORDS = norm([
  'amazon', 'アマゾン', '楽天市場', 'ラクテンイチバ', 'rakutenichiba', '楽天ブックス', 'yahooショッピング', 'ヤフーショッピング',
  'yahoo!ショッピング', 'paypayモール', 'zozo', 'ゾゾタウン', 'ヨドバシ', 'yodobashi', 'メルカリ', 'mercari', 'lohaco', 'ロハコ',
  'qoo10', 'シーイン', 'shein', '通販',
]);

const includesAny = (s: string, words: string[]) => words.some((w) => w !== '' && s.includes(w));

/** 金融機関名がカードらしいか */
export function isCardInstitution(institution: string): boolean {
  return includesAny(normalizeName(institution), CARD_INSTITUTION_WORDS);
}

/** 金融機関名が銀行らしいか（電子マネー・通販サイト・QR 決済などは false） */
export function isBankInstitution(institution: string): boolean {
  return includesAny(normalizeName(institution), BANK_INSTITUTION_WORDS);
}

/** 金融機関名や内容が通販サイトらしいか */
export function isEcommerceText(s: string): boolean {
  return includesAny(normalizeName(s), EC_WORDS);
}

/** 内容が引き落としならではの言葉を含むか（A）。「カード」だけでは false */
export function looksLikeWithdrawal(content: string): boolean {
  const n = normalizeName(content);
  return includesAny(n, WITHDRAWAL_WORDS) && !includesAny(n, NOT_WITHDRAWAL_WORDS);
}

/** 辞書でカード会社を見つける（見つからなければ undefined） */
function companyOf(normalized: string): string | undefined {
  return CARD_COMPANIES.find((c) => includesAny(normalized, c.aliases))?.name;
}

/** カードの金融機関名から、照合に使う手がかり（2文字以上の、文字の種類ごとの塊）を取り出す */
export function institutionTokens(institution: string): string[] {
  let n = normalizeName(institution);
  for (const g of GENERIC_WORDS) n = n.split(g).join(' ');
  const tokens = n.match(/[a-z0-9]+|[ァ-ヺー]+|[\p{Script=Han}]+|[\p{L}]+/gu) ?? [];
  return [...new Set(tokens.filter((t) => (/^[a-z0-9]+$/.test(t) ? t.length >= 3 : t.length >= 2) && t !== 'ー'))];
}

/** 内容から、データ内のどのカードの引き落としかを名前で特定する（B・C） */
function cardByName(content: string, cards: CardInfo[]): CardInfo | undefined {
  const n = normalizeName(content);
  const company = companyOf(n);
  if (company) {
    const byCompany = cards.filter((c) => c.company === company);
    if (byCompany.length === 1) return byCompany[0];
  }
  const byToken = cards.filter((c) => c.tokens.some((t) => n.includes(t)));
  if (byToken.length === 1) return byToken[0];
  return undefined;
}

/** 内容に「カードの名前＋カード」（例：ミドリカード、ﾗｸﾃﾝｶｰﾄﾞ）が続けて書かれているか */
function hasCardNamePhrase(content: string, card: CardInfo): boolean {
  const n = normalizeName(content);
  const names = [...card.tokens, ...(CARD_COMPANIES.find((c) => c.name === card.company)?.aliases ?? [])];
  return names.some((name) => CARD_WORDS.some((w) => n.includes(name + w)));
}

// ---------------------------------------------------------------------------
// 金額の照合（D）

interface CardInfo {
  institution: string;
  company?: string;
  tokens: string[];
  /** 利用日（昇順・重複なし）と、その日までの利用額の累計 */
  dates: string[];
  cum: number[];
}

const CLOSING_DAYS = [5, 10, 15, 20, 25, 31];

function closingDate(y: number, m: number, day: number): string {
  // m は 1〜12 以外も可（年をまたぐ）
  const d = new Date(Date.UTC(y, m - 1, 1));
  const yy = d.getUTCFullYear();
  const mm = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** dates の中で date 以下の最後の位置（なければ -1） */
function lastIndexAtOrBefore(dates: string[], date: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** (from, to] の利用額の合計 */
function sumBetween(card: CardInfo, fromExclusive: string, toInclusive: string): number {
  const a = lastIndexAtOrBefore(card.dates, fromExclusive);
  const b = lastIndexAtOrBefore(card.dates, toInclusive);
  return (b >= 0 ? card.cum[b] : 0) - (a >= 0 ? card.cum[a] : 0);
}

/**
 * 引き落とし額が、そのカードのある締め期間の利用額とほぼ一致するか。
 * 締め日（5・10・15・20・25日・月末）と支払月（翌月・翌々月）の組み合わせを試す。
 * 差が1%以内（最低10円）なら一致とみなす。
 */
export function amountMatchesCard(card: CardInfo, withdrawalDate: string, amount: number): boolean {
  if (card.dates.length === 0) return false;
  const y = Number(withdrawalDate.slice(0, 4));
  const m = Number(withdrawalDate.slice(5, 7));
  const tol = Math.max(10, amount * 0.01);
  for (const offset of [1, 2]) {
    for (const day of CLOSING_DAYS) {
      const to = closingDate(y, m - offset, day);
      const from = closingDate(y, m - offset - 1, day);
      // 締め日が引き落とし日より後になる組み合わせや、カードのデータがない期間は比べない
      if (to >= withdrawalDate || card.dates[0] > to) continue;
      const total = sumBetween(card, from, to);
      if (total > 0 && Math.abs(total - amount) <= tol) return true;
    }
  }
  return false;
}

function buildCards(transactions: Transaction[]): CardInfo[] {
  const byInst = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (!t.institution || !isCardInstitution(t.institution)) continue;
    let days = byInst.get(t.institution);
    if (!days) byInst.set(t.institution, (days = new Map()));
    // 請求額には振替・計算対象外の利用（電子マネーへのチャージなど）も含まれるため、すべて数える
    days.set(t.date, (days.get(t.date) ?? 0) - t.amount);
  }
  return [...byInst.entries()].map(([institution, days]) => {
    const dates = [...days.keys()].sort();
    const cum: number[] = [];
    let s = 0;
    for (const d of dates) cum.push((s += days.get(d)!));
    return { institution, company: companyOf(normalizeName(institution)), tokens: institutionTokens(institution), dates, cum };
  });
}

// ---------------------------------------------------------------------------
// 検出結果の型

export interface WithdrawalItem {
  t: Transaction;
  /** カードの利用額とほぼ一致したか */
  amountMatched: boolean;
}

export interface WithdrawalGroup {
  /** 表示・React の key 用 */
  key: string;
  /** カードの金融機関名（特定できなかったときは undefined） */
  card?: string;
  /** どうやってカードを特定したか */
  identifiedBy?: 'name' | 'amount';
  /** 引き落とし口座 */
  bank: string;
  /** 内容の表記（1つ以上） */
  contents: string[];
  /** 日付の新しい順 */
  items: WithdrawalItem[];
  total: number;
  /** 「二重ではない」の記録に使うキー（表記ごと） */
  dismissKeys: string[];
}

export interface DuplicatePair {
  key: string;
  /** 通販側 */
  ec: Transaction;
  /** カード側（除外する側） */
  card: Transaction;
}

export interface DoubleCountResult {
  withdrawals: WithdrawalGroup[];
  duplicates: DuplicatePair[];
}

export const EMPTY_DOUBLE_COUNT: DoubleCountResult = { withdrawals: [], duplicates: [] };

export function withdrawalKey(bank: string, content: string): string {
  return `w|${bank}|${content}`;
}

export function duplicateKey(a: string, b: string): string {
  return a < b ? `d|${a}|${b}` : `d|${b}|${a}`;
}

/** 候補になりうる明細（支出・振替でない・除外されていない） */
const eligible = (t: Transaction, excluded: ExclusionMap) => t.amount < 0 && !t.isTransfer && !excluded.has(t.id);

// ---------------------------------------------------------------------------
// カード引き落とし

export function findWithdrawals(transactions: Transaction[], excluded: ExclusionMap, dismissed: Set<string>): WithdrawalGroup[] {
  const cards = buildCards(transactions);
  if (cards.length === 0 && !transactions.some((t) => t.amount < 0 && isBankInstitution(t.institution) && looksLikeWithdrawal(t.content))) return [];
  const groups = new Map<string, WithdrawalGroup>();
  const nameCache = new Map<string, CardInfo | undefined>();

  for (const t of transactions) {
    // 引き落とし口座は銀行らしい金融機関に限る（電子マネー・通販サイトなどの買い物を拾わない）
    if (!eligible(t, excluded) || !isBankInstitution(t.institution) || isCardInstitution(t.institution)) continue;
    if (dismissed.has(withdrawalKey(t.institution, t.content))) continue;
    const keyword = looksLikeWithdrawal(t.content);
    let card = nameCache.get(t.content);
    if (!nameCache.has(t.content)) nameCache.set(t.content, (card = cardByName(t.content, cards)));
    // 名前で特定できない、またはキーワードがない場合は、金額で裏付けをとる
    const amount = -t.amount;
    let identifiedBy: WithdrawalGroup['identifiedBy'] = card ? 'name' : undefined;
    let amountMatched = card ? amountMatchesCard(card, t.date, amount) : false;
    if (!card && keyword) {
      const hits = cards.filter((c) => amountMatchesCard(c, t.date, amount));
      if (hits.length === 1) {
        card = hits[0];
        identifiedBy = 'amount';
        amountMatched = true;
      }
    }
    // 引き落としならではの言葉がないものは、名前でカードが分かり、かつ「○○カード」と続けて書かれているか、金額が一致したときだけ候補にする
    if (!keyword && !(card && (amountMatched || hasCardNamePhrase(t.content, card)))) continue;

    const gkey = card ? `c|${card.institution}|${t.institution}` : `u|${t.institution}|${t.content}`;
    let g = groups.get(gkey);
    if (!g) {
      g = { key: gkey, card: card?.institution, identifiedBy, bank: t.institution, contents: [], items: [], total: 0, dismissKeys: [] };
      groups.set(gkey, g);
    }
    if (identifiedBy === 'name') g.identifiedBy = 'name';
    if (!g.contents.includes(t.content)) {
      g.contents.push(t.content);
      g.dismissKeys.push(withdrawalKey(t.institution, t.content));
    }
    g.items.push({ t, amountMatched });
    g.total += amount;
  }

  const list = [...groups.values()];
  for (const g of list) g.items.sort((a, b) => (a.t.date < b.t.date ? 1 : a.t.date > b.t.date ? -1 : 0));
  // カードを特定できたものを先に、件数の多い順
  return list.sort((a, b) => Number(!a.card) - Number(!b.card) || b.items.length - a.items.length || a.key.localeCompare(b.key, 'ja'));
}

// ---------------------------------------------------------------------------
// 重複購入

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;

/** 2件のうちどちらが通販側か（決められなければ undefined） */
function ecSide(a: Transaction, b: Transaction): { ec: Transaction; card: Transaction } | undefined {
  const ia = isEcommerceText(a.institution);
  const ib = isEcommerceText(b.institution);
  if (ia !== ib) return ia ? { ec: a, card: b } : { ec: b, card: a };
  if (ia && ib) return undefined;
  const ca = isEcommerceText(a.content);
  const cb = isEcommerceText(b.content);
  if (ca !== cb) return ca ? { ec: a, card: b } : { ec: b, card: a };
  return undefined;
}

/** 金額が同じ・日付が3日以内・金融機関が異なり、片方が通販サイトの支出の組。1つの明細は1組にだけ入れる（日付の近い組を優先） */
export function findDuplicates(transactions: Transaction[], excluded: ExclusionMap, dismissed: Set<string>, maxDays = 3): DuplicatePair[] {
  const byAmount = new Map<number, Transaction[]>();
  for (const t of transactions) {
    if (!eligible(t, excluded)) continue;
    const list = byAmount.get(t.amount);
    if (list) list.push(t);
    else byAmount.set(t.amount, [t]);
  }

  const found: { diff: number; ec: Transaction; card: Transaction }[] = [];
  for (const list of byAmount.values()) {
    if (list.length < 2) continue;
    const sorted = list.map((t) => ({ t, d: dayNumber(t.date) })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].d - sorted[i].d <= maxDays; j++) {
        const a = sorted[i].t;
        const b = sorted[j].t;
        if (a.institution === b.institution) continue;
        const side = ecSide(a, b);
        if (!side || dismissed.has(duplicateKey(a.id, b.id))) continue;
        found.push({ diff: sorted[j].d - sorted[i].d, ...side });
      }
    }
  }

  found.sort((x, y) => x.diff - y.diff || (x.card.date < y.card.date ? 1 : -1));
  const used = new Set<string>();
  const pairs: DuplicatePair[] = [];
  for (const f of found) {
    if (used.has(f.ec.id) || used.has(f.card.id)) continue;
    used.add(f.ec.id);
    used.add(f.card.id);
    pairs.push({ key: duplicateKey(f.ec.id, f.card.id), ec: f.ec, card: f.card });
  }
  // 新しい順
  return pairs.sort((a, b) => (a.card.date < b.card.date ? 1 : a.card.date > b.card.date ? -1 : a.key.localeCompare(b.key)));
}

// ---------------------------------------------------------------------------
// まとめ

export function findDoubleCounts(transactions: Transaction[], excluded: ExclusionMap, dismissed: DismissedCandidate[]): DoubleCountResult {
  const keys = new Set(dismissed.map((d) => d.key));
  return {
    withdrawals: findWithdrawals(transactions, excluded, keys),
    duplicates: findDuplicates(transactions, excluded, keys),
  };
}

/** 候補の件数（引き落としは明細の件数、重複購入は組の数）。ym を渡すとその月だけ */
export function countCandidates(r: DoubleCountResult, ym?: string): { withdrawals: number; duplicates: number; total: number } {
  const w = r.withdrawals.reduce((s, g) => s + (ym ? g.items.filter((i) => i.t.ym === ym).length : g.items.length), 0);
  const d = ym ? r.duplicates.filter((p) => p.ec.ym === ym || p.card.ym === ym).length : r.duplicates.length;
  return { withdrawals: w, duplicates: d, total: w + d };
}

/** その月に関係する候補だけにする（引き落としのまとまりは、その月の明細を含むものを残す。中身は全期間のまま） */
export function filterByMonth(r: DoubleCountResult, ym: string): DoubleCountResult {
  return {
    withdrawals: r.withdrawals.filter((g) => g.items.some((i) => i.t.ym === ym)),
    duplicates: r.duplicates.filter((p) => p.ec.ym === ym || p.card.ym === ym),
  };
}

// ---------------------------------------------------------------------------
// 除外ルールの条件

/** カード引き落としのまとまりの表示名 */
export function withdrawalLabel(g: WithdrawalGroup): string {
  return g.card ?? g.contents[0];
}

/** カード引き落としを除外するルール（内容の表記ごとに1つ） */
export function withdrawalRules(g: WithdrawalGroup): { name: string; cond: RuleConditions }[] {
  const base = `${withdrawalLabel(g)}の引き落とし`;
  return g.contents.map((content, i) => ({
    name: i === 0 ? base : `${base}（${i + 1}）`,
    cond: { content: { op: 'equals', value: content }, institutions: [g.bank], flow: 'expense' },
  }));
}

/** 重複購入のカード側だけに当たるルール */
export function duplicateRule(p: DuplicatePair): { name: string; cond: RuleConditions } {
  const t = p.card;
  const abs = -t.amount;
  const cond: RuleConditions = {
    institutions: [t.institution],
    dateFrom: t.date,
    dateTo: t.date,
    amountMin: abs,
    amountMax: abs,
    flow: 'expense',
  };
  if (t.content.trim() !== '') cond.content = { op: 'equals', value: t.content.trim() };
  const label = (t.content.trim() || t.institution).slice(0, 20);
  return { name: `重複：${formatDateFull(t.date)} ${label} ${formatYen(abs)}`, cond };
}

/** 「二重ではない」の記録 */
export function dismissWithdrawal(g: WithdrawalGroup, now = Date.now()): DismissedCandidate[] {
  return g.dismissKeys.map((key, i) => ({ key, kind: 'withdrawal', label: `${withdrawalLabel(g)}の引き落とし（${g.bank}・${g.contents[i]}）`, dismissedAt: now }));
}

export function dismissDuplicate(p: DuplicatePair, now = Date.now()): DismissedCandidate {
  return {
    key: p.key,
    kind: 'duplicate',
    label: `${formatDateFull(p.card.date)} ${p.ec.content || p.ec.institution} ${formatYen(-p.card.amount)}`,
    dismissedAt: now,
  };
}

/** 候補を1件ずつ表すキーの集まり（引き落としは明細ID、重複購入は組のキー）。取り込み前後の比較に使う */
export function candidateKeys(r: DoubleCountResult): Set<string> {
  const keys = new Set<string>();
  for (const g of r.withdrawals) for (const i of g.items) keys.add(`w|${i.t.id}`);
  for (const p of r.duplicates) keys.add(p.key);
  return keys;
}

/** before になかった候補の件数（取り込みで新しく見つかった候補） */
export function countNewCandidates(r: DoubleCountResult, before: Set<string>): number {
  let n = 0;
  for (const k of candidateKeys(r)) if (!before.has(k)) n++;
  return n;
}
