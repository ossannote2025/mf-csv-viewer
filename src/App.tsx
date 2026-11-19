import { lazy, Suspense, useEffect } from 'react';
import { Page } from './components/Page';
import { TabBar } from './components/TabBar';
import { UpdateBanner } from './components/UpdateBanner';
import { Onboarding } from './features/onboarding/Onboarding';
import { DoubleCountSheet } from './features/doubleCount/DoubleCountSheet';
import { ImportDialogs } from './features/settings/ImportDialogs';
import { MissingSheet } from './features/settings/MissingSheet';
import { RescueScreen } from './features/settings/RescueScreen';
import { SettingsTab } from './features/settings/SettingsTab';
import { SummaryTab } from './features/summary/SummaryTab';
import { TransactionsTab } from './features/transactions/TransactionsTab';
import { MonthlyPrintReport } from './features/report/MonthlyPrintReport';
import { useAppStore } from './store/useAppStore';

// グラフ（Recharts）は大きいので、グラフタブを開いたときに読み込む
const ChartsTab = lazy(() => import('./features/charts/ChartsTab'));


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
    content = <RescueScreen message={loadError ?? ''} />;
  } else if (!hasData && tab !== 'settings') {
    content = (
      <Page title="CSV取り込み">
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
      {status === 'ready' && <MissingSheet />}
      {status === 'ready' && hasData && reportYm && <MonthlyPrintReport ym={reportYm} />}
      <ImportDialogs />
      <UpdateBanner />
    </>
  );
}
