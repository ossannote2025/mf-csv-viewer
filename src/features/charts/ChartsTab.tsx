import { ChartIcon } from '../../components/Icons';
import { Page } from '../../components/Page';

export function ChartsTab() {
  return (
    <Page title="グラフ">
      <div className="flex flex-col items-center px-6 py-16 text-center text-muted">
        <ChartIcon className="size-12" />
        <p className="mt-4 font-bold text-ink">グラフは次のアップデートで追加予定です</p>
        <p className="mt-2 text-sm leading-relaxed">
          大項目別のドーナツグラフや、月別の収入・支出の推移グラフを予定しています。
          それまでは「集計」タブで月ごとの内訳を確認できます。
        </p>
      </div>
    </Page>
  );
}
