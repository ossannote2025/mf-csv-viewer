import { Segmented } from '../../components/Chips';
import { Page } from '../../components/Page';
import { useAppStore, type ChartView } from '../../store/useAppStore';
import { BreakdownView } from './BreakdownView';
import { CategoryView } from './CategoryView';
import { InstitutionView } from './InstitutionView';
import { TrendView } from './TrendView';

const VIEWS: { value: ChartView; label: string }[] = [
  { value: 'breakdown', label: '内訳' },
  { value: 'trend', label: '推移' },
  { value: 'category', label: 'カテゴリ' },
  { value: 'institution', label: '金融機関' },
];

export default function ChartsTab() {
  const view = useAppStore((s) => s.chartView);
  const setView = useAppStore((s) => s.setChartView);
  return (
    <Page title="グラフ" sub={<Segmented value={view} options={VIEWS} onChange={setView} tone="onHeader" />}>
      {view === 'breakdown' && <BreakdownView />}
      {view === 'trend' && <TrendView />}
      {view === 'category' && <CategoryView />}
      {view === 'institution' && <InstitutionView />}
    </Page>
  );
}
