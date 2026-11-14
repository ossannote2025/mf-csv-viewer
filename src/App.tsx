import { lazy, Suspense, useEffect } from 'react';
import { Page } from './components/Page';
import { TabBar } from './components/TabBar';
import { UpdateBanner } from './components/UpdateBanner';
import { Onboarding } from './features/onboarding/Onboarding';
import { DoubleCountSheet } from './features/doubleCount/DoubleCountSheet';
import { ImportDialogs } from './features/settings/ImportDialogs';
import { SettingsTab } from './features/settings/SettingsTab';
import { SummaryTab } from './features/summary/SummaryTab';
import { TransactionsTab } from './features/transactions/TransactionsTab';
import { MonthlyPrintReport } from './features/report/MonthlyPrintReport';
import { useAppStore } from './store/useAppStore';

// グラフ（Recharts）は大きいので、グラフタブを開いたときに読み込む
const ChartsTab = lazy(() => import('./features/charts/ChartsTab'));

const TITLES = { transactions: '明細', charts: 'グラフ', summary: '集計', settings: '設定' } as const;

export default function App() {
  const status = useAppStore((s) => s.status);
  const loadError = useAppStore((s) => s.loadError);
  const tab = useAppStore((s) => s.tab);
  const hasData = useAppStore((s) => s.transactions.length > 0);
  const init = useAppStore((s) => s.init);
  const reportYm = useAppStore((s) => s.reportYm);

  useEffect(() => {
    void init();
  }, [init]);

  // タブを切り替えたら先頭に戻す
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  let content;
  if (status === 'loading') {
    content = <p className="py-24 text-center text-muted">読み込み中…</p>;
  } else if (status === 'error') {
    content = (
      <Page title="エラー">
        <p className="p-4 text-danger">{loadError}</p>
      </Page>
    );
  } else if (!hasData && tab !== 'settings') {
    content = (
      <Page title={TITLES[tab]}>
        <Onboarding />
      </Page>
    );
  } else {
    content =
      tab === 'transactions' ? <TransactionsTab /> : tab === 'charts' ? (
        <Suspense fallback={<p className="py-24 text-center text-muted">読み込み中…</p>}>
          <ChartsTab />
        </Suspense>
      ) : tab === 'summary' ? <SummaryTab /> : <SettingsTab />;
  }

  return (
    <>
      {content}
      {status === 'ready' && <TabBar />}
      {status === 'ready' && <DoubleCountSheet />}
      {status === 'ready' && hasData && reportYm && <MonthlyPrintReport ym={reportYm} />}
      <ImportDialogs />
      <UpdateBanner />
    </>
  );
}
