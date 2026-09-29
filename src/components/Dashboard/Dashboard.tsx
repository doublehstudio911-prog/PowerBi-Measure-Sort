import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { formatCycle } from '../../engine';
import { EmptyState, PageHeader } from '../common/ui';
import { ExportMenu } from '../common/ExportMenu';

function KpiCard({ value, label, tone, onClick, hint }: { value: number; label: string; tone: string; onClick?: () => void; hint?: string }) {
  return (
    <button onClick={onClick} className="card group p-5 text-left transition hover:border-blue-400 dark:hover:border-blue-500/60" title={hint}>
      <div className={`text-3xl font-semibold tabular-nums ${tone}`}>{value.toLocaleString()}</div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</div>
    </button>
  );
}

export function Dashboard() {
  const { analysis, navigate, selectMeasure, setFilters, model, loadDemo } = useApp();
  const s = analysis.summary;
  const name = (id: string) => analysis.measures.get(id)?.name ?? id;

  if (s.totalMeasures === 0) {
    return (
      <>
        <PageHeader title="Power BI Measure Analyzer" />
        <div className="card">
          <EmptyState title="No model loaded" hint="Import report metadata, add tables and measures manually, or explore with the demo data.">
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary" onClick={() => navigate('import')}>Import</button>
              <button className="btn" onClick={() => navigate('tables')}>Add manually</button>
              <button className="btn" onClick={loadDemo}>Load demo data</button>
            </div>
          </EmptyState>
        </div>
      </>
    );
  }

  const unused = [...analysis.measures.values()].filter((m) => m.status === 'unused');
  const mostUsed = [...analysis.measures.values()]
    .filter((m) => m.usedByMeasures.length + m.allVisuals.length > 0)
    .sort((a, b) => (b.usedByMeasures.length + b.allVisuals.length) - (a.usedByMeasures.length + a.allVisuals.length) || a.name.localeCompare(b.name))
    .slice(0, 8);
  const pct = (n: number) => (s.totalMeasures ? (n / s.totalMeasures) * 100 : 0);

  return (
    <>
      <PageHeader title="Power BI Measure Analyzer" subtitle={model.name ?? `${s.tables} tables · ${s.visuals} visuals · ${s.pages} pages`} actions={<ExportMenu />} />

      {s.cycles > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Circular dependency detected</div>
          <ul className="space-y-0.5 font-mono text-sm">
            {analysis.cycles.slice(0, 5).map((c, i) => (
              <li key={i}>{formatCycle(c, name)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard value={s.totalMeasures} label="Total Measures" tone="text-slate-900 dark:text-white" onClick={() => { setFilters({ status: 'all' }); navigate('measures'); }} />
        <KpiCard value={s.usedMeasures} label="Used Measures" tone="text-blue-600 dark:text-blue-400" hint={`${s.directMeasures} direct · ${s.indirectMeasures} indirect only`} onClick={() => { setFilters({ status: 'all' }); navigate('measures'); }} />
        <KpiCard value={s.unusedMeasures} label="Unused Measures" tone="text-red-600 dark:text-red-400" onClick={() => navigate('unused')} />
        <KpiCard value={s.dependencies} label="Dependencies" tone="text-cyan-600 dark:text-cyan-400" hint="Measure → measure references" onClick={() => navigate('dependencies')} />
      </div>

      <div className="card mt-4 p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Measure usage</span>
          <span className="text-slate-500">{s.directMeasures} direct · {s.indirectMeasures} indirect only · {s.unusedMeasures} unused</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Usage distribution">
          <div className="bg-blue-500" style={{ width: `${pct(s.directMeasures)}%` }} />
          <div className="bg-cyan-400" style={{ width: `${pct(s.indirectMeasures)}%` }} />
          <div className="bg-red-500" style={{ width: `${pct(s.unusedMeasures)}%` }} />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-500">
          <span><i className="mr-1 inline-block size-2 rounded-full bg-blue-500" />Direct</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-cyan-400" />Indirect only</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-red-500" />Unused</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Unused Measures</h2>
            <button className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400" onClick={() => navigate('unused')}>All <ArrowRight size={14} /></button>
          </div>
          <p className="mb-2 text-xs text-slate-500">Probably safe to delete – not reachable from any visual.</p>
          {unused.length === 0 ? <p className="text-sm text-slate-500">Every measure is in use 🎉</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {unused.slice(0, 8).map((m) => (
                <li key={m.id}>
                  <button className="flex w-full items-center justify-between py-2 text-left text-sm hover:text-blue-600" onClick={() => selectMeasure(m.id)}>
                    <span className="font-medium">{m.name}</span><span className="text-xs text-slate-500">{m.table}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Most Used Measures</h2>
          <p className="mb-2 text-xs text-slate-500">Ranked by number of referencing measures + visuals.</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {mostUsed.map((m) => (
              <li key={m.id}>
                <button className="flex w-full items-center justify-between py-2 text-left text-sm hover:text-blue-600" onClick={() => selectMeasure(m.id)}>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-slate-500">{m.usedByMeasures.length} measures · {m.allVisuals.length} visuals</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Dependency Chains</h2>
          <p className="mb-2 text-xs text-slate-500">Longest measure → measure chains.</p>
          {analysis.longestChains.length === 0 ? <p className="text-sm text-slate-500">No measure references another measure.</p> : (
            <ul className="space-y-2">
              {analysis.longestChains.slice(0, 5).map((c, i) => (
                <li key={i} className="rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-800">
                  <button className="text-left" onClick={() => selectMeasure(c.path[0])}>
                    <span className="mr-2 rounded bg-slate-100 px-1.5 text-xs font-semibold dark:bg-slate-800">{c.path.length}</span>
                    {c.path.map(name).join(' → ')}{c.endsInCycle && ' ⟲'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {analysis.warnings.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="mb-2 font-semibold">Data warnings ({analysis.warnings.length})</h2>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm text-slate-600 dark:text-slate-400">
            {analysis.warnings.slice(0, 50).map((w, i) => <li key={i}>• {w.message}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
