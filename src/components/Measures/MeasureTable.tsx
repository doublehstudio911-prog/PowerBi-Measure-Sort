import { useState } from 'react';
import { useApp } from '../../state/AppState';
import type { MeasureInfo } from '../../types/powerbi';
import { CycleBadge, EmptyState, StatusBadge } from '../common/ui';

const PAGE = 200;

export function MeasureTable({ measures, variant = 'all' }: { measures: MeasureInfo[]; variant?: 'all' | 'unused' }) {
  const { selectMeasure, selected } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<{ key: 'name' | 'table' | 'refs' | 'direct'; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  const sorted = [...measures].sort((a, b) => {
    const v = sort.key === 'name' ? a.name.localeCompare(b.name) : sort.key === 'table' ? a.table.localeCompare(b.table)
      : sort.key === 'refs' ? a.usedByMeasures.length - b.usedByMeasures.length : a.directVisuals.length - b.directVisuals.length;
    return v * sort.dir;
  });
  const th = (key: typeof sort.key, label: string) => (
    <th className="th cursor-pointer select-none" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  if (!measures.length) return <EmptyState title="No measures match" hint="Adjust the search or filters." />;
  return (
    <div>
      <div className="overflow-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              {th('name', 'Measure')}{th('table', 'Table')}
              {variant === 'all' && <th className="th">Status</th>}
              {variant === 'unused' && <th className="th">DAX</th>}
              {variant === 'unused' && <th className="th">Last change</th>}
              {th('direct', 'Direct')}
              <th className="th">Indirect</th>
              {th('refs', 'References')}
              {variant === 'all' && <th className="th">Depends on</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((m) => (
              <tr
                key={m.id}
                onClick={() => selectMeasure(m.id)}
                className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-800/60 ${selected === m.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
              >
                <td className="td font-medium text-slate-900 dark:text-white">
                  {m.name} {m.inCycle && <CycleBadge />}
                </td>
                <td className="td text-slate-500">{m.table}</td>
                {variant === 'all' && <td className="td"><StatusBadge status={m.status} alsoIndirect={m.isDirect && m.isIndirect} /></td>}
                {variant === 'unused' && (
                  <td className="td max-w-md"><code className="line-clamp-2 whitespace-pre-wrap font-mono text-xs text-slate-600 dark:text-slate-400">{m.dax}</code></td>
                )}
                {variant === 'unused' && <td className="td whitespace-nowrap text-slate-500">{m.lastModified ?? '—'}</td>}
                <td className="td tabular-nums" title="Visuals using the measure directly">{m.directVisuals.length}</td>
                <td className="td tabular-nums" title="Used measures referencing this measure">{m.indirectMeasureUsages}</td>
                <td className="td tabular-nums" title="Measures referencing this measure (used or not)">{m.usedByMeasures.length}</td>
                {variant === 'all' && <td className="td tabular-nums">{m.dependsOn.length}</td>}
              </tr>
            ))}
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
