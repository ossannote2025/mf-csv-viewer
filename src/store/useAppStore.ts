import { create } from 'zustand';
import { sortByDateDesc } from '../lib/aggregate';
import { EMPTY_FILTER, type TransactionFilter } from '../lib/filter';
import { importCsvBytes, summarize, type FileImportResult, type ImportSummary } from '../lib/importer';
import { computeExclusions } from '../lib/rules';
import type { ExclusionMap, ExclusionRule, Transaction } from '../lib/types';
import * as repo from '../db/repo';

export type Tab = 'transactions' | 'charts' | 'summary' | 'settings';

export interface ImportProgress {
  current: number;
  total: number;
  fileName: string;
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  loadError?: string;
  /** 日付の降順に並んだ全明細 */
  transactions: Transaction[];
  rules: ExclusionRule[];
  excluded: ExclusionMap;
  meta: { lastImportAt?: number; lastBackupAt?: number };
  persisted: boolean | null;

  tab: Tab;
  filter: TransactionFilter;
  /** 集計タブで選択中の月 */
  summaryYm?: string;

  importProgress: ImportProgress | null;
  importSummary: ImportSummary | null;

  init: () => Promise<void>;
  setTab: (tab: Tab) => void;
  setFilter: (patch: Partial<TransactionFilter>) => void;
  resetFilter: () => void;
  /** 条件を指定して明細タブを開く */
  showTransactions: (filter: Partial<TransactionFilter>) => void;
  setSummaryYm: (ym: string) => void;
  importFiles: (files: File[]) => Promise<void>;
  closeImportSummary: () => void;
  deleteMonth: (ym: string) => Promise<void>;
  saveRule: (rule: ExclusionRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
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
  persisted: null,
  tab: 'transactions',
  filter: EMPTY_FILTER,
  importProgress: null,
  importSummary: null,

  init: async () => {
    try {
      const data = await repo.loadAll();
      set({ status: 'ready', meta: data.meta, ...withExclusions(sortByDateDesc(data.transactions), data.rules) });
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

  importFiles: async (files) => {
    if (files.length === 0 || get().importProgress) return;
    const byId = new Map(get().transactions.map((t) => [t.id, t]));
    const results: FileImportResult[] = [];
    // 名前順に取り込む（同じIDが複数ファイルにある場合の上書き順を安定させる）
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      set({ importProgress: { current: i + 1, total: sorted.length, fileName: file.name } });
      const importedAt = Date.now();
      try {
        const bytes = await file.arrayBuffer();
        // 失敗時に巻き戻せるよう、保存が終わるまでは仮のMapで計算する
        const draft = new Map(byId);
        const { result, transactions } = importCsvBytes(bytes, file.name, draft, importedAt);
        if (result.ok) {
          await repo.saveImported(transactions, {
            fileName: file.name,
            importedAt,
            rowCount: result.rowCount,
            added: result.added,
            updated: result.updated,
          });
          for (const t of transactions) byId.set(t.id, t);
        }
        results.push(result);
      } catch (e) {
        results.push({
          fileName: file.name,
          ok: false,
          error: `保存中にエラーが発生しました（${errorMessage(e)}）。`,
          rowCount: 0,
          added: 0,
          updated: 0,
          rowErrors: [],
          months: [],
        });
      }
      // 画面の更新（進捗表示）のために制御を戻す
      await new Promise((r) => setTimeout(r, 0));
    }
    const summary = summarize(results);
    const anyOk = results.some((r) => r.ok);
    set((s) => ({
      importProgress: null,
      importSummary: summary,
      meta: anyOk ? { ...s.meta, lastImportAt: Date.now() } : s.meta,
      ...(anyOk ? withExclusions(sortByDateDesc([...byId.values()]), s.rules) : {}),
    }));
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
    set({ meta: {}, filter: EMPTY_FILTER, summaryYm: undefined, ...withExclusions([], data.rules) });
  },
}));
