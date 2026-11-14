import { describe, expect, it } from 'vitest';
import {
  candidateKeys,
  countCandidates,
  countNewCandidates,
  dismissDuplicate,
  dismissWithdrawal,
  duplicateRule,
  filterByMonth,
  findDoubleCounts,
  findDuplicates,
  findWithdrawals,
  institutionTokens,
  isCardInstitution,
  isBankInstitution,
  isEcommerceText,
  looksLikeWithdrawal,
  normalizeName,
  withdrawalRules,
} from './doubleCount';
import { computeExclusions, BUILTIN_RULES, matchesRule } from './rules';
import type { ExclusionMap, ExclusionRule, Transaction } from './types';

let seq = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'institution'>): Transaction {
  seq++;
  return {
    id: p.id ?? `T${seq}`,
    ym: p.date.slice(0, 7),
    content: 'x',
    large: '未分類',
    middle: '未分類',
    memo: '',
    isTarget: true,
    isTransfer: false,
    sourceFile: 'f',
    row: seq,
    importedAt: 0,
    ...p,
  };
}

const none: ExclusionMap = new Map();
const noKeys = new Set<string>();
const BANK = 'さくら架空銀行';
const CARD = 'みどり架空カード';

/** カードの利用（9月に合計 50,000円、10月に合計 30,000円）と、銀行からの引き落とし */
function cardMonths(): Transaction[] {
  return [
    tx({ date: '2025-09-03', amount: -20000, institution: CARD, content: '架空スーパー' }),
    tx({ date: '2025-09-20', amount: -30000, institution: CARD, content: '架空家電' }),
    tx({ date: '2025-10-05', amount: -10000, institution: CARD, content: '架空スーパー' }),
    tx({ date: '2025-10-25', amount: -20000, institution: CARD, content: '架空書店' }),
  ];
}

describe('normalizeName', () => {
  it('半角カナ・全角英字・ひらがな・記号の違いを吸収する', () => {
    expect(normalizeName('ﾗｸﾃﾝｶｰﾄﾞｻｰﾋﾞｽ')).toBe('ラクテンカードサービス');
    expect(normalizeName('ﾗｸﾃﾝｶ-ﾄﾞ')).toBe('ラクテンカード');
    expect(normalizeName('ＡＭＡＺＯＮ．ＣＯ．ＪＰ')).toBe('amazoncojp');
    expect(normalizeName('みどり 架空')).toBe('ミドリ架空');
  });
});

describe('判定の部品', () => {
  it('カードらしい金融機関名', () => {
    expect(isCardInstitution('みどり架空カード')).toBe(true);
    expect(isCardInstitution('三井住友カード (Vpass)')).toBe(true);
    expect(isCardInstitution('JCB CARD')).toBe(true);
    expect(isCardInstitution('さくら架空銀行')).toBe(false);
    expect(isCardInstitution('ポケット架空マネー')).toBe(false);
  });
  it('引き落としならではの言葉（「カード」だけ・ローン・デビットは除く）', () => {
    expect(looksLikeWithdrawal('ｶｰﾄﾞﾋｷｵﾄｼ')).toBe(true);
    expect(looksLikeWithdrawal('口座引落 ミツイスミトモ')).toBe(true);
    expect(looksLikeWithdrawal('口座振替 カクウカード')).toBe(true);
    expect(looksLikeWithdrawal('ﾗｸﾃﾝｶｰﾄﾞｻｰﾋﾞｽ')).toBe(false);
    expect(looksLikeWithdrawal('架空トレカ店 カード')).toBe(false);
    expect(looksLikeWithdrawal('ｶｰﾄﾞﾛｰﾝ ﾍﾝｻｲ')).toBe(false);
    expect(looksLikeWithdrawal('家賃 ハナミズキ荘')).toBe(false);
  });
  it('銀行らしい金融機関名', () => {
    expect(isBankInstitution('さくら架空銀行')).toBe(true);
    expect(isBankInstitution('あおぞら架空信金')).toBe(true);
    expect(isBankInstitution('架空信用金庫')).toBe(true);
    expect(isBankInstitution('ゆうちょ銀行')).toBe(true);
    expect(isBankInstitution('Kakuu Bank')).toBe(true);
    expect(isBankInstitution('ポケット架空マネー')).toBe(false);
    expect(isBankInstitution('架空通販モール')).toBe(false);
  });
  it('通販サイトらしい名前', () => {
    expect(isEcommerceText('Amazon.co.jp')).toBe(true);
    expect(isEcommerceText('ﾗｸﾃﾝｲﾁﾊﾞ')).toBe(true);
    expect(isEcommerceText('架空通販モール')).toBe(true);
    expect(isEcommerceText('まるまるスーパー')).toBe(false);
  });
  it('金融機関名から共通語を除いた手がかりを取り出す', () => {
    expect(institutionTokens('みどり架空カード')).toEqual(['ミドリ', '架空']);
    expect(institutionTokens('エポスカード')).toEqual(['エポス']);
    expect(institutionTokens('Sample Card Gold')).toEqual(['sample']);
  });
});

describe('カード引き落とし', () => {
  it('振替になっていない引き落としを、名前でカードを特定してまとめる', () => {
    const ts = [
      ...cardMonths(),
      tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'カード引き落とし ミドリカード' }),
      tx({ date: '2025-11-27', amount: -30000, institution: BANK, content: 'ｶｰﾄﾞﾋｷｵﾄｼ ﾐﾄﾞﾘｶｰﾄﾞ' }),
      tx({ date: '2025-10-25', amount: -78000, institution: BANK, content: '家賃 ハナミズキ荘' }),
    ];
    const g = findWithdrawals(ts, none, noKeys);
    expect(g).toHaveLength(1);
    expect(g[0].card).toBe(CARD);
    expect(g[0].identifiedBy).toBe('name');
    expect(g[0].bank).toBe(BANK);
    expect(g[0].contents).toEqual(['カード引き落とし ミドリカード', 'ｶｰﾄﾞﾋｷｵﾄｼ ﾐﾄﾞﾘｶｰﾄﾞ']);
    expect(g[0].items.map((i) => i.t.date)).toEqual(['2025-11-27', '2025-10-27']);
    expect(g[0].total).toBe(80000);
    // 月末締め・翌月払いの利用額と一致する
    expect(g[0].items.map((i) => i.amountMatched)).toEqual([true, true]);
  });

  it('辞書で漢字の金融機関名と半角カナの内容を結び付ける', () => {
    const ts = [
      tx({ date: '2025-09-10', amount: -1000, institution: '楽天カード', content: 'x' }),
      tx({ date: '2025-10-27', amount: -12345, institution: '架空銀行', content: 'ﾗｸﾃﾝｶｰﾄﾞｻｰﾋﾞｽ' }),
    ];
    const g = findWithdrawals(ts, none, noKeys);
    expect(g[0].card).toBe('楽天カード');
    expect(g[0].items[0].amountMatched).toBe(false);
  });

  it('名前で分からなくても、利用額と一致するカードが1つなら金額で特定する', () => {
    const ts = [...cardMonths(), tx({ date: '2025-10-10', amount: -50000, institution: BANK, content: 'クレジット ｼﾞﾄﾞｳﾋｷｵﾄｼ' })];
    const g = findWithdrawals(ts, none, noKeys);
    expect(g[0].card).toBe(CARD);
    expect(g[0].identifiedBy).toBe('amount');
  });

  it('カードを特定できないものは、内容ごとの別のまとまりにする', () => {
    const ts = [tx({ date: '2025-10-27', amount: -5000, institution: BANK, content: 'ナゾノカード ﾋｷｵﾄｼ' })];
    const g = findWithdrawals(ts, none, noKeys);
    expect(g).toHaveLength(1);
    expect(g[0].card).toBeUndefined();
    expect(withdrawalRules(g[0])[0].name).toBe('ナゾノカード ﾋｷｵﾄｼの引き落とし');
  });

  it('「カード」を含むだけの買い物や、銀行以外の支出は候補にしない', () => {
    const ts = [
      ...cardMonths(),
      // 銀行からの買い物（カードの名前と結び付かない）
      tx({ date: '2025-10-03', amount: -3300, institution: BANK, content: '架空トレカ店 カード' }),
      tx({ date: '2025-10-04', amount: -1000, institution: BANK, content: 'マネーカード架空' }),
      // 電子マネー・通販サイトの支出（引き落としの言葉があっても対象外）
      tx({ date: '2025-10-05', amount: -500, institution: 'ポケット架空マネー', content: 'ミドリカード ﾋｷｵﾄｼ' }),
      tx({ date: '2025-10-06', amount: -800, institution: '架空通販モール', content: 'カードケース' }),
      // カードの名前と結び付くが、「カード」も金額の一致もない（例：そのカード会社の店での買い物）
      tx({ date: '2025-10-07', amount: -900, institution: BANK, content: 'ミドリ商店' }),
    ];
    expect(findWithdrawals(ts, none, noKeys)).toEqual([]);
  });

  it('カードの名前と「カード」がそろえば、引き落としの言葉がなくても候補にする', () => {
    const ts = [
      tx({ date: '2025-09-10', amount: -1000, institution: '楽天カード', content: 'x' }),
      tx({ date: '2025-10-27', amount: -12345, institution: '架空銀行', content: 'ﾗｸﾃﾝｶｰﾄﾞｻｰﾋﾞｽ' }),
      tx({ date: '2025-10-28', amount: -2000, institution: '架空銀行', content: 'ラクテン市場' }),
    ];
    expect(findWithdrawals(ts, none, noKeys).flatMap((g) => g.contents)).toEqual(['ﾗｸﾃﾝｶｰﾄﾞｻｰﾋﾞｽ']);
  });

  it('キーワードがなくても、名前と金額の両方が合えば候補にする（どちらかだけなら候補にしない）', () => {
    const ts = [
      ...cardMonths(),
      tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'ミドリ' }),
      tx({ date: '2025-10-28', amount: -999, institution: BANK, content: 'ミドリ商店' }),
    ];
    const g = findWithdrawals(ts, none, noKeys);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((i) => i.t.content)).toEqual(['ミドリ']);
  });

  it('振替・除外済み・カード側・収入・「二重ではない」の明細は候補にしない', () => {
    const transfer = tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'カード引き落とし ミドリカード', isTransfer: true });
    const excludedTx = tx({ date: '2025-11-27', amount: -1, institution: BANK, content: 'カード引き落とし ミドリカード' });
    const onCard = tx({ date: '2025-10-01', amount: -500, institution: CARD, content: 'カード年会費以外' });
    const income = tx({ date: '2025-10-02', amount: 500, institution: BANK, content: 'カード返金' });
    const other = tx({ date: '2025-10-03', amount: -700, institution: 'あおぞら架空信金', content: 'ミドリカード' });
    const ts = [...cardMonths(), transfer, excludedTx, onCard, income, other];
    const excluded: ExclusionMap = new Map([[excludedTx.id, ['r']]]);
    expect(findWithdrawals(ts, excluded, new Set()).map((g) => g.bank)).toEqual(['あおぞら架空信金']);
    expect(findWithdrawals(ts, excluded, new Set(['w|あおぞら架空信金|ミドリカード']))).toEqual([]);
  });

  it('除外ルールは表記ごとに作り、その明細だけに当たる', () => {
    const ts = [
      ...cardMonths(),
      tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'カード引き落とし ミドリカード' }),
      tx({ date: '2025-11-27', amount: -30000, institution: BANK, content: 'ﾐﾄﾞﾘｶｰﾄﾞ' }),
    ];
    const [g] = findWithdrawals(ts, none, noKeys);
    const specs = withdrawalRules(g);
    expect(specs.map((s) => s.name)).toEqual([`${CARD}の引き落とし`, `${CARD}の引き落とし（2）`]);
    expect(specs[0].cond).toEqual({ content: { op: 'equals', value: 'カード引き落とし ミドリカード' }, institutions: [BANK], flow: 'expense' });
    const rules: ExclusionRule[] = specs.map((s, i) => ({ id: `r${i}`, name: s.name, enabled: true, order: 10 + i, cond: s.cond, createdAt: 0, updatedAt: 0 }));
    const hit = ts.filter((t) => rules.some((r) => matchesRule(r, t)));
    expect(hit.map((t) => t.institution)).toEqual([BANK, BANK]);
    // ルールを作ると候補から消える
    expect(findWithdrawals(ts, computeExclusions(ts, rules), noKeys)).toEqual([]);
  });

  it('「二重ではない」は表記ごとの記録になる', () => {
    const ts = [...cardMonths(), tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'カード引き落とし ミドリカード' })];
    const [g] = findWithdrawals(ts, none, noKeys);
    const d = dismissWithdrawal(g, 5);
    expect(d).toEqual([
      { key: `w|${BANK}|カード引き落とし ミドリカード`, kind: 'withdrawal', label: `${CARD}の引き落とし（${BANK}・カード引き落とし ミドリカード）`, dismissedAt: 5 },
    ]);
    expect(findDoubleCounts(ts, none, d).withdrawals).toEqual([]);
  });
});

describe('重複購入', () => {
  const ec = '架空通販モール';
  it('金額が同じ・3日以内・金融機関が異なり、片方が通販の組を見つける', () => {
    const a = tx({ date: '2025-11-03', amount: -3980, institution: ec, content: '架空イヤホン' });
    const b = tx({ date: '2025-11-05', amount: -3980, institution: CARD, content: 'カクウツウハン' });
    const p = findDuplicates([a, b], none, noKeys);
    expect(p).toHaveLength(1);
    expect(p[0].ec.id).toBe(a.id);
    expect(p[0].card.id).toBe(b.id);
  });

  it('4日以上離れている・同じ金融機関・金額が違う・どちらも通販でない組は候補にしない', () => {
    const ts = [
      tx({ date: '2025-11-01', amount: -1000, institution: ec, content: 'a' }),
      tx({ date: '2025-11-05', amount: -1000, institution: CARD, content: 'b' }),
      tx({ date: '2025-11-10', amount: -2000, institution: ec, content: 'c' }),
      tx({ date: '2025-11-10', amount: -2000, institution: ec, content: 'd' }),
      tx({ date: '2025-11-12', amount: -3000, institution: ec, content: 'e' }),
      tx({ date: '2025-11-12', amount: -3001, institution: CARD, content: 'f' }),
      tx({ date: '2025-11-15', amount: -4000, institution: BANK, content: 'g' }),
      tx({ date: '2025-11-15', amount: -4000, institution: CARD, content: 'h' }),
    ];
    expect(findDuplicates(ts, none, noKeys)).toEqual([]);
  });

  it('金融機関が通販でなくても、内容が通販なら通販側とする（両方とも通販なら候補にしない）', () => {
    const a = tx({ date: '2025-11-03', amount: -500, institution: 'ポケット架空マネー', content: 'AMAZON.CO.JP' });
    const b = tx({ date: '2025-11-03', amount: -500, institution: CARD, content: '架空ストア' });
    expect(findDuplicates([a, b], none, noKeys)[0].card.id).toBe(b.id);
    const c = tx({ date: '2025-11-03', amount: -700, institution: 'Amazon.co.jp', content: '架空本' });
    const d = tx({ date: '2025-11-03', amount: -700, institution: CARD, content: 'AMAZON.CO.JP' });
    expect(findDuplicates([c, d], none, noKeys)[0].card.id).toBe(d.id);
  });

  it('1つの明細は日付の近い1組にだけ入れる', () => {
    const e1 = tx({ date: '2025-11-01', amount: -800, institution: ec, content: 'a' });
    const c1 = tx({ date: '2025-11-03', amount: -800, institution: CARD, content: 'b' });
    const c2 = tx({ date: '2025-11-01', amount: -800, institution: 'そよかぜ架空カード', content: 'c' });
    const p = findDuplicates([e1, c1, c2], none, noKeys);
    expect(p).toHaveLength(1);
    expect(p[0].card.id).toBe(c2.id);
    // その組を「二重ではない」にすると、もう一方の組が出る
    const d = dismissDuplicate(p[0]);
    expect(findDuplicates([e1, c1, c2], none, new Set([d.key]))[0].card.id).toBe(c1.id);
  });

  it('振替・除外済みは候補にしない', () => {
    const a = tx({ date: '2025-11-03', amount: -500, institution: ec, content: 'a' });
    const b = tx({ date: '2025-11-03', amount: -500, institution: CARD, content: 'b', isTransfer: true });
    expect(findDuplicates([a, b], none, noKeys)).toEqual([]);
    const c = tx({ date: '2025-11-03', amount: -500, institution: CARD, content: 'c' });
    expect(findDuplicates([a, c], new Map([[a.id, ['r']]]), noKeys)).toEqual([]);
  });

  it('カード側だけに当たるルールを作る', () => {
    const a = tx({ date: '2025-11-03', amount: -3980, institution: ec, content: '架空イヤホン' });
    const b = tx({ date: '2025-11-05', amount: -3980, institution: CARD, content: 'カクウツウハン' });
    const other = tx({ date: '2025-11-06', amount: -3980, institution: CARD, content: 'カクウツウハン' });
    const [p] = findDuplicates([a, b], none, noKeys);
    const spec = duplicateRule(p);
    expect(spec.name).toBe('重複：2025/11/5 カクウツウハン ¥3,980');
    const rule: ExclusionRule = { id: 'r', name: spec.name, enabled: true, order: 10, cond: spec.cond, createdAt: 0, updatedAt: 0 };
    expect([a, b, other].filter((t) => matchesRule(rule, t)).map((t) => t.id)).toEqual([b.id]);
  });
});

describe('件数と月の絞り込み', () => {
  it('引き落としは明細の件数、重複購入は組の数で数える', () => {
    const ts = [
      ...cardMonths(),
      tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'カード引き落とし ミドリカード' }),
      tx({ date: '2025-11-27', amount: -30000, institution: BANK, content: 'カード引き落とし ミドリカード' }),
      tx({ date: '2025-11-03', amount: -3980, institution: '架空通販モール', content: 'a' }),
      tx({ date: '2025-11-04', amount: -3980, institution: CARD, content: 'b' }),
    ];
    const r = findDoubleCounts(ts, computeExclusions(ts, BUILTIN_RULES), []);
    expect(countCandidates(r)).toEqual({ withdrawals: 2, duplicates: 1, total: 3 });
    expect(countCandidates(r, '2025-10')).toEqual({ withdrawals: 1, duplicates: 0, total: 1 });
    expect(countCandidates(r, '2025-12').total).toBe(0);
    const oct = filterByMonth(r, '2025-10');
    expect(oct.withdrawals).toHaveLength(1);
    expect(oct.duplicates).toHaveLength(0);
  });
});

describe('取り込みで新しく見つかった候補', () => {
  it('取り込み前になかった候補だけを数える', () => {
    const before = [...cardMonths(), tx({ date: '2025-10-27', amount: -50000, institution: BANK, content: 'カード引き落とし ミドリカード' })];
    const r1 = findDoubleCounts(before, none, []);
    const after = [
      ...before,
      tx({ date: '2025-11-27', amount: -30000, institution: BANK, content: 'カード引き落とし ミドリカード' }),
      tx({ date: '2025-11-03', amount: -3980, institution: '架空通販モール', content: 'a' }),
      tx({ date: '2025-11-04', amount: -3980, institution: CARD, content: 'b' }),
    ];
    const r2 = findDoubleCounts(after, none, []);
    expect(countCandidates(r2).total).toBe(3);
    expect(countNewCandidates(r2, candidateKeys(r1))).toBe(2);
    expect(countNewCandidates(r2, candidateKeys(r2))).toBe(0);
  });
});

describe('速さ', () => {
  it('10年分・6万件でも1秒以内に終わる', () => {
    const ts: Transaction[] = [];
    const shops = Array.from({ length: 300 }, (_, i) => `架空店${i}`);
    for (let y = 2016; y < 2026; y++) {
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        for (let i = 0; i < 500; i++) {
          const d = String(1 + (i % 28)).padStart(2, '0');
          const inst = i % 5 === 0 ? '架空通販モール' : i % 2 ? CARD : 'そよかぜ架空カード';
          ts.push(tx({ date: `${y}-${mm}-${d}`, amount: -(100 + ((i * 37 + m * 11 + y) % 9000)), institution: inst, content: shops[i % 300] }));
        }
        ts.push(tx({ date: `${y}-${mm}-27`, amount: -80000, institution: BANK, content: 'カード引き落とし ミドリカード' }));
      }
    }
    const start = performance.now();
    const r = findDoubleCounts(ts, computeExclusions(ts, BUILTIN_RULES), []);
    const ms = performance.now() - start;
    expect(ts.length).toBeGreaterThan(60000);
    expect(r.withdrawals[0].items).toHaveLength(120);
    expect(ms).toBeLessThan(1000);
  });
});

describe('sample/ の架空データ', () => {
  it('振替になっていない引き落とし2種類と、通販とカードの重複1組を見つける', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { importCsvBytes } = await import('./importer');
    const dir = join(__dirname, '../../sample');
    const existing = new Map<string, Transaction>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv')).sort()) importCsvBytes(readFileSync(join(dir, f)), f, existing);
    const ts = [...existing.values()];
    const r = findDoubleCounts(ts, computeExclusions(ts, BUILTIN_RULES), []);

    expect(r.withdrawals.map((g) => [g.card, g.bank, g.items.length])).toEqual([
      [CARD, BANK, 4],
      ['そよかぜ架空カード', 'あおぞら架空信金', 1],
    ]);
    // 11月の引き落としは10月のカード利用額と一致する
    expect(r.withdrawals[0].items.find((i) => i.t.ym === '2025-11')!.amountMatched).toBe(true);
    expect(r.withdrawals[1].contents).toEqual(['ｿﾖｶｾﾞｶｰﾄﾞ']);
    expect(r.duplicates.map((p) => [p.ec.content, p.card.content, p.card.date])).toEqual([['架空ワイヤレスイヤホン', 'カクウツウハンモール', '2025-11-05']]);
  });
});
