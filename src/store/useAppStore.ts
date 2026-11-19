import { create } from 'zustand';
import { sortByDateDesc } from '../lib/aggregate';
import { EMPTY_FILTER, type TransactionFilter } from '../lib/filter';
import { importCsvBytes, summarize, type FileImportResult, type ImportSummary } from '../lib/importer';
import { computeExclusions } from '../lib/rules';
import type { DismissedCandidate, ExclusionMap, ExclusionRule, ImportRecord, RecurringChoice, Transaction } from '../lib/types';
import { candidateKeys, countNewCandidates, EMPTY_DOUBLE_COUNT, findDoubleCounts, type DoubleCountResult } from '../lib/doubleCount';
import * as repo from '../db/repo';
import type { RangePreset } from '../lib/series';
import { backupFileName, createBackup, parseBackup } from '../lib/backup';
import { saveFile } from '../lib/saveFile';
import { isSampleId, isSampleImport } from '../lib/sample';
import { countInSpans, findMissing, looksLikeDeletedInSource, type DateSpan } from '../lib/missing';

export type Tab = 'transactions' | 'charts' | 'summary' | 'settings';
export type ChartView = 'breakdown' | 'trend' | 'category';

export interface ImportProgress {
  /** read: ファイルの読み込み・解析中、save: 保存中 */
  phase: 'read' | 'save';
  current: number;
  total: number;
  fileName: string;
}

/** 取り込みにかかった時間（ミリ秒）。どこが遅いかを画面で確認できるようにする */
export interface ImportTiming {
  read: number;
  save: number;
  finish: number;
}

/** 今回の CSV にない明細（マネーフォワード側で削除・統合された可能性がある）。取り込み直後にだけ持つ */
export interface MissingReview {
  transactions: Transaction[];
  /** 最初からチェックを付けておくか（件数が多いときは付けない） */
  preselect: boolean;
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  loadError?: string;
  /** 起動に失敗したときの救済：全データを削除して読み込み直す */
  rescueReset: () => Promise<void>;
  /** 日付の降順に並んだ全明細 */
  transactions: Transaction[];
  rules: ExclusionRule[];
  excluded: ExclusionMap;
  /** 「二重ではない」とした二重計上の候補 */
  dismissed: DismissedCandidate[];
  /** 固定費の候補の選択（0.10.0） */
  recurringChoices: RecurringChoice[];
  /** 二重計上の候補（明細・ルール・dismissed が変わるたびに計算し直す） */
  doubleCount: DoubleCountResult;
  /** 二重計上の候補の一覧を開いているか（ym を指定するとその月の候補だけ） */
  doubleCountSheet: { ym?: string } | null;
  meta: { lastImportAt?: number; lastBackupAt?: number };
  /** 取り込み履歴（バックアップに含める） */
  imports: ImportRecord[];
  persisted: boolean | null;

  tab: Tab;
  filter: TransactionFilter;
  /** 集計タブ・グラフタブで選択中の月 */
  summaryYm?: string;
  chartView: ChartView;
  summaryMode: 'month' | 'year' | 'recurring';
  /** 年間レポートで選択中の年 */
  reportYear?: string;
  /** グラフの期間（既定は直近12か月） */
  chartRange: RangePreset;
  /** 印刷・PDF用の月次レポートを開いている月（閉じているときは null） */
  reportYm: string | null;

  importProgress: ImportProgress | null;
  /** newDoubleCount：この取り込みで新しく見つかった二重計上の候補の件数。missing：今回の CSV にない明細 */
  importSummary: (ImportSummary & { timing: ImportTiming; newDoubleCount: number; missing: MissingReview | null }) | null;
  /** 「CSV にない明細」の一覧を開いているか */
  missingReview: MissingReview | null;

  init: () => Promise<void>;
  setTab: (tab: Tab) => void;
  setFilter: (patch: Partial<TransactionFilter>) => void;
  resetFilter: () => void;
  /** 条件を指定して明細タブを開く */
  showTransactions: (filter: Partial<TransactionFilter>) => void;
  setSummaryYm: (ym: string) => void;
  setChartView: (v: ChartView) => void;
  setSummaryMode: (m: 'month' | 'year' | 'recurring') => void;
  setReportYear: (y: string) => void;
  setChartRange: (r: RangePreset) => void;
  openReport: (ym: string) => void;
  closeReport: () => void;
  importFiles: (files: File[]) => Promise<void>;
  closeImportSummary: () => void;
  openMissingReview: (review: MissingReview) => void;
  closeMissingReview: () => void;
  /** ID を指定して明細を削除する */
  deleteTransactions: (ids: string[]) => Promise<void>;
  deleteMonth: (ym: string) => Promise<void>;
  saveRule: (rule: ExclusionRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  /** 複数のルールをまとめて保存する（追加のみ） */
  addRules: (rules: ExclusionRule[]) => Promise<void>;
  openDoubleCount: (ym?: string) => void;
  closeDoubleCount: () => void;
  /** 「二重ではない」：候補を次から出さない */
  dismissCandidates: (items: DismissedCandidate[]) => Promise<void>;
  /** 「二重ではない」を取り消す */
  undismissCandidates: (keys: string[]) => Promise<void>;
  /** 固定費の候補を固定費に入れる／入れない。choice が null なら未確認に戻す */
  setRecurringChoice: (key: string, label: string, choice: RecurringChoice['choice'] | null) => Promise<void>;
  deleteAll: () => Promise<void>;
  /** サンプルの明細と、サンプルの取り込み履歴だけを削除する */
  deleteSample: () => Promise<void>;
  /** バックアップを書き出す。iPhoneでは共有シート（「ファイル」に保存）を使う */
  exportBackup: () => Promise<'shared' | 'downloaded' | 'cancelled'>;
  /** バックアップから復元する（エラー時は BackupError などを投げる） */
  restoreBackup: (file: File, mode: 'replace' | 'merge') => Promise<{ count: number }>;
}

function withExclusions(transactions: Transaction[], rules: ExclusionRule[], dismissed: DismissedCandidate[]) {
  const excluded = computeExclusions(transactions, rules);
  return { transactions, rules, excluded, dismissed, doubleCount: findDoubleCounts(transactions, excluded, dismissed) };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'loading',
  transactions: [],
  rules: [],
  excluded: new Map(),
  dismissed: [],
  recurringChoices: [],
  doubleCount: EMPTY_DOUBLE_COUNT,
  doubleCountSheet: null,
  meta: {},
  imports: [],
  persisted: null,
  tab: 'transactions',
  filter: EMPTY_FILTER,
  chartView: 'breakdown',
  summaryMode: 'month',
  chartRange: '12m',
  reportYm: null,
  importProgress: null,
  importSummary: null,
  missingReview: null,

  init: async () => {
    try {
      const data = await repo.loadAll();
      set({ status: 'ready', loadError: undefined, meta: data.meta, imports: data.imports, recurringChoices: data.recurringChoices, ...withExclusions(sortByDateDesc(data.transactions), data.rules, data.dismissed) });
      if (data.transactions.length > 0) set({ tab: 'transactions' });
      repo.requestPersistence().then((persisted) => set({ persisted }));
    } catch (e) {
      set({
        status: 'error',
        loadError: `データを読み込めませんでした（${errorMessage(e)}）。プライベートブラウズでは保存機能が使えない場合があります。`,
      });
    }
  },

  rescueReset: async () => {
    await repo.resetDatabase();
    set({ status: 'loading', loadError: undefined });
    await get().init();
  },

  setTab: (tab) => set({ tab }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set((s) => ({ filter: { ...EMPTY_FILTER, showExcluded: s.filter.showExcluded } })),
  showTransactions: (patch) => set((s) => ({ tab: 'transactions', filter: { ...EMPTY_FILTER, showExcluded: s.filter.showExcluded, ...patch } })),
  setSummaryYm: (ym) => set({ summaryYm: ym }),
  setChartView: (chartView) => set({ chartView }),
  setSummaryMode: (summaryMode) => set({ summaryMode }),
  setReportYear: (reportYear) => set({ reportYear }),
  setChartRange: (chartRange) => set({ chartRange }),
  openReport: (reportYm) => set({ reportYm }),
  closeReport: () => set({ reportYm: null }),

  importFiles: async (files) => {
    if (files.length === 0 || get().importProgress) return;
    const t0 = performance.now();
    // 取り込みの前からあった二重計上の候補（取り込み後に「新しく見つかった件数」を出すため）
    const candidatesBefore = candidateKeys(get().doubleCount);
    const byId = new Map(get().transactions.map((t) => [t.id, t]));
    /** 今回の取り込みで追加・上書きされる明細（同じIDは後のファイルが優先） */
    const changed = new Map<string, Transaction>();
    const results: FileImportResult[] = [];
    const newImports: ImportRecord[] = [];
    // 名前順に取り込む（同じIDが複数ファイルにある場合の上書き順を安定させる）
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    // 1. すべてのファイルを読み込んで解析する（まだ保存しない）
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      set({ importProgress: { phase: 'read', current: i + 1, total: sorted.length, fileName: file.name } });
      const importedAt = Date.now();
      try {
        const bytes = await file.arrayBuffer();
        const { result, transactions } = importCsvBytes(bytes, file.name, byId, importedAt);
        if (result.ok) {
          for (const t of transactions) changed.set(t.id, t);
          newImports.push({ fileName: file.name, importedAt, rowCount: result.rowCount, added: result.added, updated: result.updated });
        }
        results.push(result);
      } catch (e) {
        results.push(failedResult(file.name, `ファイルを読み込めませんでした（${errorMessage(e)}）。`));
      }
      // 画面の更新（進捗表示）のために、ときどき制御を戻す
      if (i % 5 === 4 || i === sorted.length - 1) await new Promise((r) => setTimeout(r, 0));
    }
    const t1 = performance.now();

    // 2. まとめて保存する
    let saveFailed = false;
    if (changed.size > 0) {
      const total = changed.size;
      set({ importProgress: { phase: 'save', current: 0, total, fileName: '' } });
      try {
        await repo.saveImportBatch([...changed.values()], newImports, (done) =>
          set({ importProgress: { phase: 'save', current: done, total, fileName: '' } }),
        );
      } catch (e) {
        saveFailed = true;
        const msg = `保存中にエラーが発生しました（${errorMessage(e)}）。端末の空き容量を確認してください。`;
        for (let i = 0; i < results.length; i++) if (results[i].ok) results[i] = failedResult(results[i].fileName, msg);
      }
    }
    const t2 = performance.now();

    // 3. 画面のデータを更新する（保存に失敗したときはDBの内容に合わせ直す）
    if (saveFailed) {
      const loaded = await repo.loadAll();
      set({ meta: loaded.meta, imports: loaded.imports, ...withExclusions(sortByDateDesc(loaded.transactions), get().rules, get().dismissed) });
    } else if (changed.size > 0) {
      set((s) => ({
        meta: { ...s.meta, lastImportAt: Date.now() },
        imports: [...s.imports, ...newImports],
        ...withExclusions(sortByDateDesc([...byId.values()]), s.rules, s.dismissed),
      }));
    }
    const t3 = performance.now();
    // 今回の CSV にない明細（保存に失敗したときは調べない）
    let missing: MissingReview | null = null;
    if (!saveFailed && changed.size > 0) {
      const spans = results.filter((r) => r.ok && r.complete && r.span).map((r) => r.span as DateSpan);
      const stored = get().transactions;
      const found = findMissing(stored, spans, new Set(changed.keys()));
      if (found.length > 0) missing = { transactions: found, preselect: looksLikeDeletedInSource(found.length, countInSpans(stored, spans)) };
    }
    set({
      importProgress: null,
      importSummary: {
        ...summarize(results),
        timing: { read: t1 - t0, save: t2 - t1, finish: t3 - t2 },
        newDoubleCount: countNewCandidates(get().doubleCount, candidatesBefore),
        missing,
      },
    });
  },

  closeImportSummary: () => set({ importSummary: null }),
  openMissingReview: (missingReview) => set({ missingReview }),
  closeMissingReview: () => set({ missingReview: null }),

  deleteTransactions: async (ids) => {
    if (ids.length === 0) return;
    await repo.deleteTransactions(ids);
    const gone = new Set(ids);
    set((s) => withExclusions(s.transactions.filter((t) => !gone.has(t.id)), s.rules, s.dismissed));
  },

  deleteMonth: async (ym) => {
    await repo.deleteMonth(ym);
    set((s) => withExclusions(s.transactions.filter((t) => t.ym !== ym), s.rules, s.dismissed));
  },

  saveRule: async (rule) => {
    await repo.saveRule(rule);
    set((s) => {
      const rules = s.rules.some((r) => r.id === rule.id) ? s.rules.map((r) => (r.id === rule.id ? rule : r)) : [...s.rules, rule];
      return withExclusions(s.transactions, rules.sort((a, b) => a.order - b.order), s.dismissed);
    });
  },

  deleteRule: async (id) => {
    await repo.deleteRule(id);
    set((s) => withExclusions(s.transactions, s.rules.filter((r) => r.id !== id), s.dismissed));
  },

  addRules: async (rules) => {
    if (rules.length === 0) return;
    await repo.saveRules(rules);
    set((s) => withExclusions(s.transactions, [...s.rules, ...rules].sort((a, b) => a.order - b.order), s.dismissed));
  },

  openDoubleCount: (ym) => set({ doubleCountSheet: { ym } }),
  closeDoubleCount: () => set({ doubleCountSheet: null }),

  dismissCandidates: async (items) => {
    if (items.length === 0) return;
    await repo.addDismissed(items);
    set((s) => {
      const keys = new Set(items.map((d) => d.key));
      const dismissed = [...s.dismissed.filter((d) => !keys.has(d.key)), ...items];
      return { dismissed, doubleCount: findDoubleCounts(s.transactions, s.excluded, dismissed) };
    });
  },

  undismissCandidates: async (keys) => {
    if (keys.length === 0) return;
    await repo.removeDismissed(keys);
    set((s) => {
      const k = new Set(keys);
      const dismissed = s.dismissed.filter((d) => !k.has(d.key));
      return { dismissed, doubleCount: findDoubleCounts(s.transactions, s.excluded, dismissed) };
    });
  },

  setRecurringChoice: async (key, label, choice) => {
    if (choice === null) await repo.removeRecurringChoices([key]);
    else await repo.putRecurringChoices([{ key, label, choice, decidedAt: Date.now() }]);
    set((s) => {
      const rest = s.recurringChoices.filter((c) => c.key !== key);
      return { recurringChoices: choice === null ? rest : [...rest, { key, label, choice, decidedAt: Date.now() }] };
    });
  },

  deleteAll: async () => {
    await repo.deleteAllData();
    const data = await repo.loadAll();
    set({ meta: {}, imports: [], recurringChoices: [], filter: EMPTY_FILTER, summaryYm: undefined, doubleCountSheet: null, missingReview: null, reportYm: null, ...withExclusions([], data.rules, []) });
  },

  deleteSample: async () => {
    await repo.deleteSampleData();
    set((s) => ({
      imports: s.imports.filter((r) => !isSampleImport(r)),
      // サンプルの月・明細を指したままにならないように、表示の状態を戻す
      filter: { ...EMPTY_FILTER, showExcluded: s.filter.showExcluded },
      summaryYm: undefined,
      doubleCountSheet: null,
      missingReview: null,
      reportYm: null,
      ...withExclusions(s.transactions.filter((t) => !isSampleId(t.id)), s.rules, s.dismissed),
    }));
  },

  exportBackup: async () => {
    // 共有シートはタップ直後に呼ぶ必要があるため、ここまで await を挟まない
    const { transactions, rules, meta, imports, dismissed, recurringChoices } = get();
    const now = Date.now();
    const json = JSON.stringify(createBackup(transactions, rules, imports, meta, dismissed, recurringChoices, now));
    const name = backupFileName(new Date(now));
    const file = new File([json], name, { type: 'application/json' });

    const result = await saveFile(file);
    if (result === 'cancelled') return result;
    await repo.setMeta('lastBackupAt', now);
    set((s) => ({ meta: { ...s.meta, lastBackupAt: now } }));
    return result;
  },

  restoreBackup: async (file, mode) => {
    const data = parseBackup(await file.text());
    await repo.restoreBackup(data, mode);
    const loaded = await repo.loadAll();
    set({
      meta: loaded.meta,
      imports: loaded.imports,
      recurringChoices: loaded.recurringChoices,
      filter: EMPTY_FILTER,
      summaryYm: undefined,
      doubleCountSheet: null,
      missingReview: null,
      ...withExclusions(sortByDateDesc(loaded.transactions), loaded.rules, loaded.dismissed),
    });
    return { count: data.transactions.length };
  },
}));


function failedResult(fileName: string, error: string): FileImportResult {
  return { fileName, ok: false, error, rowCount: 0, added: 0, updated: 0, rowErrors: [], months: [] };
}
