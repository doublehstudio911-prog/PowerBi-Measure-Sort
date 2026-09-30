import { AlertTriangle, GitFork, X } from 'lucide-react';
import { useMemo } from 'react';
import { useApp } from '../../state/AppState';
import { getDependencyTree, getUsedByTree } from '../../engine';
import { CycleBadge, Dax, FieldParameterBadge, Stat, StatusBadge, UsageDisclaimer, UsageLevelBadge } from '../common/ui';
import { technicalReasonPath, usageReason } from '../../utils/reasons';
import { ReasonPath, UsageTree } from './UsageTree';

export function MeasureDetail() {
  const { selected, selectMeasure, analysis, openInGraph } = useApp();
  const m = selected ? analysis.measures.get(selected) : undefined;
  const depTree = useMemo(() => (m ? getDependencyTree(analysis, m.id) : null), [analysis, m]);
  const usedByTree = useMemo(() => (m ? getUsedByTree(analysis, m.id) : null), [analysis, m]);
  if (!m || !depTree || !usedByTree) return null;

  const visualLabel = (id: string) => { const v = analysis.visuals.get(id); return v ? `${v.page} › ${v.name}` : id; };
  const u = analysis.usage.measures.get(m.id);
  const fmt = (n: number) => n.toLocaleString('en-US');
  const params = m.fieldParameters.map((id) => analysis.fieldParameters.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
  const heading = m.status === 'direct' ? 'DIRECTLY USED' : m.status === 'indirect' ? 'USED INDIRECTLY' : 'UNUSED';

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px]" onClick={() => selectMeasure(null)} />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" aria-label="Measure detail">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-900 dark:text-white">{m.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Table: <b className="font-medium text-slate-700 dark:text-slate-300">{m.table}</b></span>
              <StatusBadge status={m.status} alsoIndirect={m.isDirect && m.isIndirect} />
              {m.inCycle && <CycleBadge />}
              {u?.usageStatus && analysis.usage.hasData && <UsageLevelBadge level={u.usageStatus} />}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn" onClick={() => openInGraph(m.id)}><GitFork size={14} /> Graph</button>
            <button className="btn" onClick={() => selectMeasure(null)} aria-label="Close"><X size={14} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-auto p-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Used in visuals" value={m.allVisuals.length} />
            <Stat label={`Depends on (${m.transitiveDependencyCount} incl. indirect)`} value={m.dependsOn.length} />
            <Stat label="Used by measures" value={m.usedByMeasures.length} />
          </div>

          {m.inCycle && (
            <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                Circular dependency: {analysis.cycles.filter((c) => c.members.includes(m.id)).map((c) => [...c.path, c.path[0]].map((p) => analysis.measures.get(p)?.name).join(' → ')).join(' | ')}
              </div>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Technical usage</h3>
            <div className="space-y-1 text-sm">
              <div>Technical status: <b>{m.isUsed ? 'USED' : 'UNUSED'}</b> <span className="text-slate-500">({m.status.toUpperCase()})</span></div>
              {m.reason && <div className="text-slate-600 dark:text-slate-300">Source: {m.reason.root.kind === 'column' ? `calculated column ${m.reason.root.column}` : m.reason.root.fieldParameter ? `Field Parameter „${analysis.fieldParameters.get(m.reason.root.fieldParameter)?.name ?? m.reason.root.fieldParameter}“` : m.status === 'direct' ? 'direct visual reference' : 'dependency of a used measure'}</div>}
              {m.reason && <div className="text-xs text-slate-500">{technicalReasonPath(analysis, m)}</div>}
            </div>
            {params.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">Field parameters <FieldParameterBadge /></div>
                {params.map((f) => (
                  <div key={f.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-slate-500">
                      Used by: {f.usedByVisuals.map((v) => `${analysis.visuals.get(v)?.page} › ${analysis.visuals.get(v)?.name}`).join(', ')}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-500">The measure is selectable in these visuals. Which one is actually selected cannot be determined from the metadata.</p>
              </div>
            )}
          </section>

          {analysis.usage.hasData && u && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Estimated reach (page views)</h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Potential page views" value={fmt(u.pageViewsPotential)} />
                <Stat label="Direct potential views" value={fmt(u.directPageViewsPotential)} />
                <Stat label="Indirect potential views" value={fmt(u.indirectPageViewsPotential)} />
                <Stat label="Parameter candidate views" value={fmt(u.parameterCandidateViews)} />
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <li>Usage: <b>{u.usageStatus}</b> – {usageReason(m, u)}</li>
                <li>Visuals: {u.directVisualCount} direct · {u.indirectVisualCount} indirect · {u.fieldParameterVisualCount} via field parameter</li>
                {u.uniqueUsersPotential !== undefined && <li>Unique users (sum over pages, <b>not de-duplicated</b>): {fmt(u.uniqueUsersPotential)}</li>}
                {params.length > 0 && <li>Actual selection frequency: <b>not determinable</b></li>}
              </ul>
              <UsageDisclaimer className="mt-3" />
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Why is this measure {m.status === 'unused' ? 'unused' : 'in use'}?</h3>
            {m.reason ? (
              <>
                <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500">{heading}</div>
                <ReasonPath reason={m.reason} analysis={analysis} />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No visual and no used measure references this measure – it cannot be reached from any report page.
                {m.usedByMeasures.length > 0 && ' It is referenced only by other unused measures.'} Likely safe to delete.
              </p>
            )}
            {m.usedByColumns.length > 0 && <p className="mt-2 text-xs text-slate-500">Also referenced by calculated columns: {m.usedByColumns.join(', ')}</p>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">DAX</h3>
            <Dax>{m.dax}</Dax>
            {(m.usedTables.length > 0 || m.usedColumns.length > 0) && (
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                {m.usedTables.length > 0 && <div>Tables: {m.usedTables.join(', ')}</div>}
                {m.usedColumns.length > 0 && <div>Columns: {m.usedColumns.map((c) => `${c.table}[${c.column}]`).join(', ')}</div>}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Depends on</h3>
            {m.dependsOn.length ? <UsageTree node={depTree} /> : <p className="text-sm text-slate-500">No other measures referenced.</p>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Used by</h3>
            {m.usedByMeasures.length ? <UsageTree node={usedByTree} /> : <p className="text-sm text-slate-500">Not referenced by any measure.</p>}
            {m.directVisuals.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {m.directVisuals.map((v) => <li key={v} className="text-slate-600 dark:text-slate-300">▣ {visualLabel(v)}</li>)}
              </ul>
            )}
            {m.fieldParameterVisuals.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {m.fieldParameterVisuals.map((v) => <li key={v} className="text-slate-600 dark:text-slate-300">◇ {visualLabel(v)} <span className="text-xs text-slate-400">(via field parameter)</span></li>)}
              </ul>
            )}
            {m.indirectVisuals.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">Reached indirectly from {m.indirectVisuals.length} visual(s): {m.indirectVisuals.slice(0, 8).map(visualLabel).join(', ')}{m.indirectVisuals.length > 8 ? ' …' : ''}</p>
            )}
          </section>

          {m.allVisuals.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Pages</h3>
              <ul className="space-y-1 text-sm">
                {[...new Set(m.allVisuals.map((v) => analysis.visuals.get(v)?.page).filter((p): p is string => !!p))].sort().map((p) => {
                  const pu = analysis.usage.pages.find((x) => x.page === p);
                  return (
                    <li key={p} className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{p}</span>
                      {analysis.usage.hasData && <span className="text-xs text-slate-500">{pu ? `${fmt(pu.views)} views` : 'no usage row'}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {m.lastModified && <p className="text-xs text-slate-500">Last change: {m.lastModified}</p>}
        </div>
      </aside>
    </>
  );
}
