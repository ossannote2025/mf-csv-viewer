/** 1明細（マネーフォワードMEの「収入・支出詳細」CSVの1行） */
export interface Transaction {
  /** CSVのID（明細ごとに一意） */
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'YYYY-MM'（日付から自動算出） */
  ym: string;
  /** 内容 */
  content: string;
  /** 金額（円）。支出はマイナス、収入はプラス */
  amount: number;
  /** 保有金融機関 */
  institution: string;
  /** 大項目 */
  large: string;
  /** 中項目 */
  middle: string;
  memo: string;
  /** 計算対象=1 */
  isTarget: boolean;
  /** 振替=1 */
  isTransfer: boolean;
  /** 取り込み元のファイル名 */
  sourceFile: string;
  /** ファイル内の行番号（同じ日付内の並び順に使う） */
  row: number;
  importedAt: number;
}

export type BuiltinRuleKind = 'transfer' | 'nonTarget';

export interface RuleConditions {
  content?: { op: 'contains' | 'equals' | 'startsWith'; value: string };
  institutions?: string[];
  large?: string[];
  middle?: string[];
  /** 金額の絶対値の下限（以上） */
  amountMin?: number;
  /** 金額の絶対値の上限（以下） */
  amountMax?: number;
  flow?: 'income' | 'expense';
  /** 'YYYY-MM-DD'（この日以降） */
  dateFrom?: string;
  /** 'YYYY-MM-DD'（この日以前） */
  dateTo?: string;
}

export interface ExclusionRule {
  id: string;
  name: string;
  enabled: boolean;
  /** 組み込みルール（削除不可、ON/OFFのみ） */
  builtin?: BuiltinRuleKind;
  order: number;
  cond: RuleConditions;
  createdAt: number;
  updatedAt: number;
}

export interface ImportRecord {
  seq?: number;
  fileName: string;
  importedAt: number;
  rowCount: number;
  added: number;
  updated: number;
}

/** 明細ID → その明細に当てはまった除外ルールIDの一覧 */
export type ExclusionMap = Map<string, string[]>;

/** 「二重ではない」と判断された二重計上の候補（次から候補に出さない） */
export interface DismissedCandidate {
  /** 引き落とし：'w|口座|内容'、重複購入：'d|明細ID|明細ID' */
  key: string;
  kind: 'withdrawal' | 'duplicate';
  /** 一覧で「もとに戻す」ときの表示名 */
  label: string;
  dismissedAt: number;
}
