import { totals } from './aggregate';
import { shiftYm } from './date';
import { change, type Change } from './series';
import type { ExclusionMap, Transaction } from './types';

/**
 * 月次の支出レポート（印刷・PDF用）のデータ。
 * 家族に見せる用途のため、収入がわかる・逆算できる情報（収入の行・収入合計・収支など）は一切持たない。
 */
export interface MonthlyReportData {
  ym: string;
  /** 支出合計（正の数） */
  total: number;
  count: number;
  /** 前月比・前年同月比（支出どうし）。比較する月がデータの期間より前なら null */
  prevMonth: Change | null;
  lastYear: Change | null;
  /** 大項目別（多い順） */
  categories: { name: string; amount: number; count: number; ratio: number }[];
  /** 大きな支出（金額の大きい順に最大10件） */
  top: ReportRow[];
  /** 明細一覧（日付の古い順） */
  rows: ReportRow[];
  /**
   * アプリの集計（集計タブ）の支出合計。振替・計算対象外のルールを OFF にしていると、レポートの合計と異なる。
   * 画面にだけ注意を出すために使う（印刷はしない）
   */
  appExpense: number;
}

export interface ReportRow {
  id: string;
  date: string;
  content: string;
  /** 支出額（正の数） */
  amount: number;
  large: string;
  middle: string;
  institution: string;
}

/**
 * レポートに載せる明細か：支出で、振替でも計算対象外でもなく、除外ルール（二重計上の「除外する」で作ったものを含む）に当てはまらない。
 * 振替・計算対象外は、設定で組み込みルールを OFF にしていても載せない（給与振込などが見えないように）
 */
export function isReportExpense(t: Transaction, excluded: ExclusionMap): boolean {
  return t.amount < 0 && !t.isTransfer && t.isTarget && !excluded.has(t.id);
}

function toRow(t: Transaction): ReportRow {
  return { id: t.id, date: t.date, content: t.content, amount: -t.amount, large: t.large, middle: t.middle, institution: t.institution };
}

function sumExpense(list: Transaction[], excluded: ExclusionMap): number {
  let s = 0;
  for (const t of list) if (isReportExpense(t, excluded)) s += -t.amount;
  return s;
}

/**
 * 月次レポートのデータを作る。
 * @param byMonth 年月 → その月の明細
 * @param oldestYm データの最も古い年月（これより前の月とは比較しない）
 */
export function buildMonthlyReport(byMonth: Map<string, Transaction[]>, excluded: ExclusionMap, ym: string, oldestYm: string): MonthlyReportData {
  const list = byMonth.get(ym) ?? [];
  const items = list.filter((t) => isReportExpense(t, excluded));
  const total = items.reduce((s, t) => s + -t.amount, 0);

  const compare = (m: string) => (m < oldestYm ? null : change(total, sumExpense(byMonth.get(m) ?? [], excluded)));

  const cats = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of items) {
    const c = cats.get(t.large) ?? { name: t.large, amount: 0, count: 0 };
    c.amount += -t.amount;
    c.count++;
    cats.set(t.large, c);
  }
  const categories = [...cats.values()]
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ja'))
    .map((c) => ({ ...c, ratio: total > 0 ? c.amount / total : 0 }));

  // 日付の古い順（同じ日は CSV の並び順）
  const rows = [...items].sort((a, b) => (a.date === b.date ? a.row - b.row : a.date < b.date ? -1 : 1)).map(toRow);
  const top = [...rows].sort((a, b) => b.amount - a.amount || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 10);

  return {
    ym,
    total,
    count: items.length,
    prevMonth: compare(shiftYm(ym, -1)),
    lastYear: compare(shiftYm(ym, -12)),
    categories,
    top,
    rows,
    appExpense: totals(list, excluded).expense,
  };
}

/** 割合の表示（12.3%） */
export function formatRatio(r: number): string {
  return `${Math.round(r * 1000) / 10}%`;
}

/** 'YYYY年M月D日' */
export function formatJaDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
