import { useState } from 'react';
import { useApp } from '../../state/AppState';
import type { MeasureInfo } from '../../types/powerbi';
import { sortMeasures, type SortKey, type SortState } from '../../utils/measureSort';
import { CycleBadge, EmptyState, FieldParameterBadge, StatusBadge, UsageLevelBadge } from '../common/ui';

const PAGE = 200;
const fmt = (n: number) => n.toLocaleString('en-US');

export function MeasureTable({ measures, variant = 'all', sort: controlledSort, onSortChange }: {
  measures: MeasureInfo[];
  variant?: 'all' | 'unused';
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
}) {
  const { selectMeasure, selected, analysis } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [localSort, setLocalSort] = useState<SortState>({ key: 'name', dir: 1 });
  const sort = controlledSort ?? localSort;
  const setSort = onSortChange ?? setLocalSort;
  const hasUsage = analysis.usage.hasData;

  const sorted = sortMeasures(analysis, measures, sort);
  const th = (key: SortKey, label: string, title?: string) => (
    <th className="th cursor-pointer select-none" title={title} onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : key === 'name' || key === 'table' ? 1 : -1 })}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  if (!measures.length) return <EmptyState title="No measures match" hint="Adjust the search or filters." />;
  const full = variant === 'all';
  return (
    <div>
      <div className="overflow-auto">
        <table className={`w-full border-collapse ${full ? 'min-w-[1100px]' : 'min-w-[820px]'}`}>
          <thead>
            <tr>
              {th('name', 'Measure')}{th('table', 'Table')}
              {full && th('status', 'Technical', 'Technical status: DIRECT / INDIRECT / UNUSED')}
              {full && hasUsage && th('usage', 'Usage', 'Observed usage class derived from page views (relative to all measures)')}
              {!full && <th className="th">DAX</th>}
              {!full && <th className="th">Last change</th>}
              {th('direct', 'Direct visuals', 'Visuals referencing the measure directly')}
              {full && th('indirect', 'Indirect visuals', 'Visuals reaching the measure through other measures')}
              {full && th('fp', 'Param. visuals', 'Visuals offering the measure through a used field parameter')}
              {full && hasUsage && th('pot', 'Potential views', 'Page views of all distinct pages where the measure is reachable (estimate, not DAX executions)')}
              {full && hasUsage && th('dpot', 'Direct views', 'Page views of pages with a visual referencing the measure directly')}
              {full && hasUsage && th('ipot', 'Indirect views', 'Page views of pages where the measure is reachable only via other measures')}
              {full && hasUsage && th('ppot', 'Param. candidate views', 'Page views of pages where the measure is selectable via a field parameter – candidate, not actual selection')}
              {th('refs', 'References', 'Measures referencing this measure (used or not)')}
              {!full && <th className="th">Indirect</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((m) => {
              const u = analysis.usage.measures.get(m.id);
              return (
                <tr
                  key={m.id}
                  onClick={() => selectMeasure(m.id)}
                  className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-800/60 ${selected === m.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
                >
                  <td className="td font-medium text-slate-900 dark:text-white">
                    <span className="mr-1">{m.name}</span>
                    {m.inCycle && <CycleBadge />} {m.fieldParameters.length > 0 && <FieldParameterBadge />}
                  </td>
                  <td className="td text-slate-500">{m.table}</td>
                  {full && <td className="td"><StatusBadge status={m.status} alsoIndirect={m.isDirect && m.isIndirect} /></td>}
                  {full && hasUsage && <td className="td">{u && <UsageLevelBadge level={u.usageStatus} />}</td>}
                  {!full && <td className="td max-w-md"><code className="line-clamp-2 whitespace-pre-wrap font-mono text-xs text-slate-600 dark:text-slate-400">{m.dax}</code></td>}
                  {!full && <td className="td whitespace-nowrap text-slate-500">{m.lastModified ?? '—'}</td>}
                  <td className="td tabular-nums">{m.directVisuals.length}</td>
                  {full && <td className="td tabular-nums">{m.indirectVisuals.length}</td>}
                  {full && <td className="td tabular-nums">{m.fieldParameterVisuals.length}</td>}
                  {full && hasUsage && <td className="td tabular-nums font-medium">{fmt(u?.pageViewsPotential ?? 0)}</td>}
                  {full && hasUsage && <td className="td tabular-nums">{fmt(u?.directPageViewsPotential ?? 0)}</td>}
                  {full && hasUsage && <td className="td tabular-nums">{fmt(u?.indirectPageViewsPotential ?? 0)}</td>}
                  {full && hasUsage && <td className="td tabular-nums">{fmt(u?.parameterCandidateViews ?? 0)}</td>}
                  <td className="td tabular-nums">{m.usedByMeasures.length}</td>
                  {!full && <td className="td tabular-nums" title="Used measures referencing this measure">{m.indirectMeasureUsages}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
        <span>Showing {Math.min(limit, sorted.length)} of {sorted.length}</span>
        {limit < sorted.length && <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>Show more</button>}
      </div>
    </div>
  );
}
