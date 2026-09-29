import { useMemo } from 'react';
import { useApp } from '../../state/AppState';
import { filterMeasures } from '../../utils/filtering';
import { PageHeader } from '../common/ui';
import { ExportMenu } from '../common/ExportMenu';
import { FilterBar } from './FilterBar';
import { MeasureTable } from './MeasureTable';

export function MeasuresPage() {
  const { analysis, query, filters } = useApp();
  const rows = useMemo(() => filterMeasures(analysis, query, filters), [analysis, query, filters]);
  return (
    <>
      <PageHeader title="Measures" subtitle={`${rows.length} of ${analysis.summary.totalMeasures} measures`} actions={<ExportMenu />} />
      <div className="card">
        <div className="border-b border-slate-200 p-3 dark:border-slate-800"><FilterBar /></div>
        <MeasureTable measures={rows} />
      </div>
    </>
  );
}
