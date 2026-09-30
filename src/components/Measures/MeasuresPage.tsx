import { useMemo, useState } from 'react';
import { useApp } from '../../state/AppState';
import { filterMeasures } from '../../utils/filtering';
import { SORT_PRESETS, type SortState } from '../../utils/measureSort';
import { PageHeader, Select, UsageDisclaimer } from '../common/ui';
import { ExportMenu } from '../common/ExportMenu';
import { FilterBar } from './FilterBar';
import { MeasureTable } from './MeasureTable';

export function MeasuresPage() {
  const { analysis, query, filters } = useApp();
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 1 });
  const rows = useMemo(() => filterMeasures(analysis, query, filters), [analysis, query, filters]);
  const preset = SORT_PRESETS.find((p) => p.sort.key === sort.key && p.sort.dir === sort.dir)?.id ?? '';
  return (
    <>
      <PageHeader title="Measures" subtitle={`${rows.length} of ${analysis.summary.totalMeasures} measures`} actions={<ExportMenu />} />
      {analysis.usage.hasData && <UsageDisclaimer className="mb-3" />}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <FilterBar />
          {analysis.usage.hasData && (
            <Select
              className="ml-auto" value={preset} placeholder="Sort: custom (column header)" options={SORT_PRESETS.map((p) => ({ value: p.id, label: `Sort: ${p.label}` }))}
              onChange={(id) => { const p = SORT_PRESETS.find((x) => x.id === id); if (p) setSort(p.sort); }}
            />
          )}
        </div>
        <MeasureTable measures={rows} sort={sort} onSortChange={setSort} />
      </div>
    </>
  );
}
