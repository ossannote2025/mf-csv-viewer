import { create } from 'zustand';
import { sortByDateDesc } from '../lib/aggregate';
import { EMPTY_FILTER, type TransactionFilter } from '../lib/filter';
import { importCsvBytes, summarize, type FileImportResult, type ImportSummary } from '../lib/importer';
import { computeExclusions } from '../lib/rules';
import type { ExclusionMap, ExclusionRule, ImportRecord, Transaction } from '../lib/types';
import * as repo from '../db/repo';
import type { RangePreset } from '../lib/series';
import { backupFileName, createBackup, parseBackup } from '../lib/backup';
import { saveFile } from '../lib/saveFile';

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

interface AppState {
  status: 'loading' | 'ready' | 'error';
  loadError?: string;
  /** 日付の降順に並んだ全明細 */
  transactions: Transaction[];
  rules: ExclusionRule[];
  excluded: ExclusionMap;
  meta: { lastImportAt?: number; lastBackupAt?: number };
  /** 取り込み履歴（バックアップに含める） */
  imports: ImportRecord[];
  persisted: boolean | null;

  tab: Tab;
  filter: TransactionFilter;
  /** 集計タブ・グラフタブで選択中の月 */
  summaryYm?: string;
  chartView: ChartView;
  summaryMode: 'month' | 'year';
  /** 年間レポートで選択中の年 */
  reportYear?: string;
  /** グラフの期間（既定は直近12か月） */
  chartRange: RangePreset;

  importProgress: ImportProgress | null;
  importSummary: (ImportSummary & { timing: ImportTiming }) | null;

  init: () => Promise<void>;
  setTab: (tab: Tab) => void;
  setFilter: (patch: Partial<TransactionFilter>) => void;
  resetFilter: () => void;
  /** 条件を指定して明細タブを開く */
  showTransactions: (filter: Partial<TransactionFilter>) => void;
  setSummaryYm: (ym: string) => void;
  setChartView: (v: ChartView) => void;
  setSummaryMode: (m: 'month' | 'year') => void;
  setReportYear: (y: string) => void;
  setChartRange: (r: RangePreset) => void;
  importFiles: (files: File[]) => Promise<void>;
  closeImportSummary: () => void;
  deleteMonth: (ym: string) => Promise<void>;
  saveRule: (rule: ExclusionRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  /** バックアップを書き出す。iPhoneでは共有シート（「ファイル」に保存）を使う */
  exportBackup: () => Promise<'shared' | 'downloaded' | 'cancelled'>;
  /** バックアップから復元する（エラー時は BackupError などを投げる） */
  restoreBackup: (file: File, mode: 'replace' | 'merge') => Promise<{ count: number }>;
}

function withExclusions(transactions: Transaction[], rules: ExclusionRule[]) {
  return { transactions, rules, excluded: computeExclusions(transactions, rules) };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'loading',
  transactions: [],
  rules: [],
  excluded: new Map(),
  meta: {},
  imports: [],
  persisted: null,
  tab: 'transactions',
  filter: EMPTY_FILTER,
  chartView: 'breakdown',
  summaryMode: 'month',
  chartRange: '12m',
  importProgress: null,
  importSummary: null,

  init: async () => {
    try {
      const data = await repo.loadAll();
      set({ status: 'ready', meta: data.meta, imports: data.imports, ...withExclusions(sortByDateDesc(data.transactions), data.rules) });
      if (data.transactions.length > 0) set({ tab: 'transactions' });
      repo.requestPersistence().then((persisted) => set({ persisted }));
    } catch (e) {
      set({
        status: 'error',
        loadError: `データを読み込めませんでした（${errorMessage(e)}）。プライベートブラウズでは保存機能が使えない場合があります。`,
      });
    }
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

  importFiles: async (files) => {
    if (files.length === 0 || get().importProgress) return;
    const t0 = performance.now();
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
      set({ meta: loaded.meta, imports: loaded.imports, ...withExclusions(sortByDateDesc(loaded.transactions), get().rules) });
    } else if (changed.size > 0) {
      set((s) => ({
        meta: { ...s.meta, lastImportAt: Date.now() },
        imports: [...s.imports, ...newImports],
        ...withExclusions(sortByDateDesc([...byId.values()]), s.rules),
      }));
    }
    const t3 = performance.now();
    set({
      importProgress: null,
      importSummary: { ...summarize(results), timing: { read: t1 - t0, save: t2 - t1, finish: t3 - t2 } },
    });
  },

  closeImportSummary: () => set({ importSummary: null }),

  deleteMonth: async (ym) => {
    await repo.deleteMonth(ym);
    set((s) => withExclusions(s.transactions.filter((t) => t.ym !== ym), s.rules));
  },

  saveRule: async (rule) => {
    await repo.saveRule(rule);
    set((s) => {
      const rules = s.rules.some((r) => r.id === rule.id) ? s.rules.map((r) => (r.id === rule.id ? rule : r)) : [...s.rules, rule];
      return withExclusions(s.transactions, rules.sort((a, b) => a.order - b.order));
    });
  },

  deleteRule: async (id) => {
    await repo.deleteRule(id);
    set((s) => withExclusions(s.transactions, s.rules.filter((r) => r.id !== id)));
  },

  deleteAll: async () => {
    await repo.deleteAllData();
    const data = await repo.loadAll();
    set({ meta: {}, imports: [], filter: EMPTY_FILTER, summaryYm: undefined, ...withExclusions([], data.rules) });
  },

  exportBackup: async () => {
    // 共有シートはタップ直後に呼ぶ必要があるため、ここまで await を挟まない
    const { transactions, rules, meta, imports } = get();
    const now = Date.now();
    const json = JSON.stringify(createBackup(transactions, rules, imports, meta, now));
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
      filter: EMPTY_FILTER,
      summaryYm: undefined,
      ...withExclusions(sortByDateDesc(loaded.transactions), loaded.rules),
    });
    return { count: data.transactions.length };
  },
}));


function failedResult(fileName: string, error: string): FileImportResult {
  return { fileName, ok: false, error, rowCount: 0, added: 0, updated: 0, rowErrors: [], months: [] };
}
