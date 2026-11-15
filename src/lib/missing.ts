/**
 * 「今回の CSV にない明細」を見つける。
 * マネーフォワード側で削除・統合した明細は、取り込み直してもアプリに残る（取り込みは ID での追加・上書きだけのため）。
 * アプリは自動では消さない。候補を見せて、ユーザーが選んだものだけを削除する。
 */
import type { Transaction } from './types';

/** 取り込んだ CSV が扱う期間（そのファイルのいちばん古い日付〜いちばん新しい日付。'YYYY-MM-DD'） */
export interface DateSpan {
  from: string;
  to: string;
}

/** 明細の日付の範囲（明細がなければ undefined） */
export function spanOf(transactions: Transaction[]): DateSpan | undefined {
  if (transactions.length === 0) return undefined;
  let from = transactions[0].date;
  let to = from;
  for (const t of transactions) {
    if (t.date < from) from = t.date;
    if (t.date > to) to = t.date;
  }
  return { from, to };
}

/**
 * 保存済みの明細のうち、取り込んだ CSV の期間内の日付なのに、今回の CSV に ID がないもの（日付の新しい順のまま返す）。
 * 期間をカレンダーの月ではなく CSV の最初〜最後の日付にしているのは、月の途中で書き出した古い CSV を取り込んでも、
 * それ以降の明細を「ない」と誤って出さないため。
 * @param stored 保存済みの明細（取り込み後でもよい。今回取り込んだ明細は importedIds に入っているので対象にならない）
 * @param spans 取り込んだファイルごとの期間
 * @param importedIds 今回の取り込みで読んだすべての明細の ID
 */
export function findMissing(stored: Transaction[], spans: DateSpan[], importedIds: ReadonlySet<string>): Transaction[] {
  if (spans.length === 0) return [];
  return stored.filter((t) => !importedIds.has(t.id) && spans.some((s) => s.from <= t.date && t.date <= s.to));
}

/** 最初からチェックを付けておく件数の上限 */
export const MISSING_AUTO_CHECK_MAX = 20;
/** 最初からチェックを付けておく割合の上限（期間内の保存済みの明細に対する割合） */
export const MISSING_AUTO_CHECK_RATIO = 0.3;

/**
 * 見つかった明細が「マネーフォワード側で消した数件」らしいか。
 * 件数が多い・期間内の明細の大半が当たるときは、別のアカウントの CSV や一部だけの CSV を取り込んだ可能性が高いので、
 * 最初はチェックを付けない（ユーザーが自分で選ぶ）
 */
export function looksLikeDeletedInSource(missingCount: number, storedInSpans: number): boolean {
  if (missingCount === 0) return false;
  return missingCount <= MISSING_AUTO_CHECK_MAX && missingCount <= storedInSpans * MISSING_AUTO_CHECK_RATIO;
}

/** 期間内にある保存済みの明細の件数（取り込み後の件数。今回取り込んだ明細も含む） */
export function countInSpans(stored: Transaction[], spans: DateSpan[]): number {
  let n = 0;
  for (const t of stored) if (spans.some((s) => s.from <= t.date && t.date <= s.to)) n++;
  return n;
}
