import { useMemo } from 'react';
import { useApp } from '../../state/AppState';
import { filterMeasures } from '../../utils/filtering';
import { downloadBlob } from '../../utils/export';
import { PageHeader } from '../common/ui';
import { FilterBar } from './FilterBar';
import { MeasureTable } from './MeasureTable';

export function UnusedPage() {
  const { analysis, query, filters } = useApp();
  const rows = useMemo(() => filterMeasures(analysis, query, { ...filters, status: 'unused' }), [analysis, query, filters]);
  const exportCsv = () => {
    const esc = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    const lines = ['Measure,Table,References,DAX', ...rows.map((m) => [m.name, m.table, String(m.usedByMeasures.length), m.dax].map(esc).join(','))];
    downloadBlob('unused-measures.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };
  return (
    <>
      <PageHeader
        title="Unused Measures"
        subtitle="Measures that are neither used by a visual nor referenced (directly or transitively) by a used measure."
        actions={<button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>}
      />
      <div className="card">
        <div className="border-b border-slate-200 p-3 dark:border-slate-800"><FilterBar showStatus={false} /></div>
        {analysis.summary.unusedMeasures === 0
          ? <div className="p-10 text-center text-sm text-slate-500">All measures are used. 🎉</div>
          : <MeasureTable measures={rows} variant="unused" />}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        “References” counts measures that reference the measure – all of them are themselves unused, otherwise this measure would be used.
        Measures referenced only by unused measures are included, since deleting the whole unused group is safe.
      </p>
    </>
  );
}
