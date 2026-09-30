import { Fragment, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, ListChecks, Upload } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { isUsageFileName } from '../../import/usageMetrics';
import { pageBreakdowns, type PageBreakdown } from '../../utils/usageViews';
import type { MeasureId } from '../../types/powerbi';
import { EmptyState, FieldParameterBadge, PageHeader, UsageDisclaimer, UsageLevelBadge } from '../common/ui';
import { UsageImportPanel } from '../Import/UsageImportPanel';

const fmt = (n: number) => n.toLocaleString('en-US');
const REASON: Record<string, string> = {
  'page-not-found': 'No page with this name in the model',
  'ambiguous-page': 'Several model pages share this name',
  'other-report': 'Row belongs to a different report',
};

function Tile({ value, label, tone = '' }: { value: string; label: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

/** Clickable measure with status colour and (if usage is loaded) its potential views. */
function MeasureChip({ id, tone }: { id: MeasureId; tone: 'direct' | 'param' | 'dep' }) {
  const { analysis, selectMeasure } = useApp();
  const m = analysis.measures.get(id);
  const u = analysis.usage.measures.get(id);
  const color = {
    direct: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100',
    param: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/10 dark:text-fuchsia-100',
    dep: 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-100',
  }[tone];
  return (
    <button
      onClick={() => selectMeasure(id)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs hover:brightness-95 ${color}`}
      title={`${m?.table ?? ''} · potential page views: ${fmt(u?.pageViewsPotential ?? 0)}`}
    >
      <span className="font-medium">{m?.name ?? id}</span>
      {u && analysis.usage.hasData && <span className="opacity-70">{fmt(u.pageViewsPotential)}</span>}
    </button>
  );
}

function MeasureGroup({ title, hint, ids, tone }: { title: string; hint: string; ids: MeasureId[]; tone: 'direct' | 'param' | 'dep' }) {
  if (ids.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h4 className="text-sm font-semibold">{title} <span className="font-normal text-slate-500">({ids.length})</span></h4>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{ids.map((id) => <MeasureChip key={id} id={id} tone={tone} />)}</div>
    </div>
  );
}

function PageDetail({ p }: { p: PageBreakdown }) {
  return (
    <div className="space-y-5 bg-slate-50/70 p-4 dark:bg-slate-950/40">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Measures connected to this page ({p.directMeasures.length + p.parameterMeasures.length + p.dependencyMeasures.length})</h3>
          <MeasureGroup title="Used directly" hint="referenced by a visual on this page" ids={p.directMeasures} tone="direct" />
          <MeasureGroup title="Selectable via field parameter" hint="candidates – which one is selected is unknown" ids={p.parameterMeasures} tone="param" />
          <MeasureGroup title="Reached through dependencies" hint="used by the measures above" ids={p.dependencyMeasures} tone="dep" />
          {p.directMeasures.length + p.parameterMeasures.length + p.dependencyMeasures.length === 0 && <p className="text-sm text-slate-500">No measures are used on this page (only columns / slicers).</p>}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Visuals on this page ({p.visuals.length})</h3>
          {p.visuals.map((v) => (
            <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-medium">{v.name}</span>
                <span className="badge bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{v.type}</span>
              </div>
              <div className="space-y-1.5">
                {v.directMeasures.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="w-20 text-[11px] uppercase text-slate-500">direct</span>{v.directMeasures.map((m) => <MeasureChip key={m} id={m} tone="direct" />)}</div>}
                {v.parameters.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="flex w-20 items-center gap-1 text-[11px] uppercase text-fuchsia-600 dark:text-fuchsia-300"><ListChecks size={11} />param.</span>
                    <span className="text-xs font-medium">{f.name} →</span>
                    {f.members.map((m) => <MeasureChip key={m} id={m} tone="param" />)}
                  </div>
                ))}
                {v.dependencyMeasures.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="w-20 text-[11px] uppercase text-slate-500">via deps</span>{v.dependencyMeasures.map((m) => <MeasureChip key={m} id={m} tone="dep" />)}</div>}
                {v.directMeasures.length + v.parameters.length + v.dependencyMeasures.length === 0 && <span className="text-xs text-slate-500">No measures (columns only)</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UsagePage() {
  const { analysis, navigate, selectMeasure } = useApp();
  const usage = analysis.usage;
  const [incoming, setIncoming] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pages = useMemo(() => pageBreakdowns(analysis), [analysis]);
  const maxViews = Math.max(1, ...pages.map((p) => p.views));
  const top = useMemo(
    () => [...analysis.measures.values()].map((m) => ({ m, u: usage.measures.get(m.id)! })).filter((x) => x.u.pageViewsPotential > 0)
      .sort((a, b) => b.u.pageViewsPotential - a.u.pageViewsPotential || a.m.name.localeCompare(b.m.name)).slice(0, 15),
    [analysis, usage],
  );

  const take = (files: FileList | File[]) => {
    const f = Array.from(files).find((x) => isUsageFileName(x.name));
    if (f) { setIncoming(f); setShowImport(true); }
  };

  const dropzone = (
    <div
      className={`card flex cursor-pointer flex-col items-center gap-2 border-dashed p-8 text-center transition ${drag ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : ''}`}
      role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}
    >
      <Upload className="text-blue-500" />
      <div className="font-medium">Drop a usage-metrics file here or click to choose</div>
      <div className="text-sm text-slate-500">CSV, XLSX or XLS · parsed locally in your browser, nothing is uploaded</div>
      <input ref={input} type="file" accept=".csv,.xlsx,.xls,text/csv" hidden aria-label="Usage metrics file (drop zone)" onChange={(e) => { if (e.target.files) take(e.target.files); e.target.value = ''; }} />
    </div>
  );

  return (
    <>
      <PageHeader
        title="Usage"
        subtitle="Which report pages are opened – and which visuals and measures are connected to them."
        actions={usage.hasData ? <button className="btn" onClick={() => setShowImport((v) => !v)}><FileSpreadsheet size={14} /> {showImport ? 'Hide import' : 'Import / replace usage file'}</button> : undefined}
      />

      {analysis.summary.totalMeasures === 0 && (
        <div className="card mb-4"><EmptyState title="No model loaded" hint="Import a PBIP / model first so that pages and measures can be matched.">
          <button className="btn btn-primary mt-2" onClick={() => navigate('import')}>Go to Import</button>
        </EmptyState></div>
      )}

      {!usage.hasData && <div className="mb-4">{dropzone}</div>}
      {(showImport || !usage.hasData) && <div className="mb-4"><UsageImportPanel incoming={incoming} onConsumed={() => setIncoming(null)} onImported={() => setShowImport(false)} /></div>}

      {usage.hasData && (
        <>
          <UsageDisclaimer className="mb-4" />
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile value={fmt(usage.totalViews)} label="Total views in file" />
            <Tile value={String(usage.pages.length)} label={`Matched pages · ${fmt(usage.matchedViews)} views`} tone="text-blue-600 dark:text-blue-400" />
            <Tile value={String(usage.unmatched.length)} label={`Unmatched pages · ${fmt(usage.unmatchedViews)} views`} tone={usage.unmatched.length ? 'text-amber-600' : ''} />
            <Tile value={String(usage.pagesWithoutUsage.length)} label="Model pages without usage rows" />
            <Tile value={String(usage.distribution.measuresWithViews)} label="Measures with observed reach" tone="text-emerald-600 dark:text-emerald-400" />
          </div>

          <section className="card mb-4">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="font-semibold">Pages</h2>
              <p className="text-xs text-slate-500">Click a page to see its visuals and every measure connected to it: used directly, selectable via field parameter, or reached through dependencies.</p>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr>
                    <th className="th w-8" /><th className="th">Page</th><th className="th">Views</th>
                    <th className="th" title="Sum over the rows of the file – not de-duplicated">Unique users*</th>
                    <th className="th">Visuals</th><th className="th">Direct</th><th className="th">Via param.</th><th className="th">Via deps</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => {
                    const isOpen = open === p.page;
                    return (
                      <Fragment key={p.page}>
                        <tr className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-800/60" onClick={() => setOpen(isOpen ? null : p.page)}>
                          <td className="td">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                          <td className="td font-medium text-slate-900 dark:text-white">
                            {p.page}
                            {!p.hasUsageRow && <span className="badge ml-2 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">no usage row</span>}
                            {p.hasUsageRow && p.views === 0 && <span className="badge ml-2 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">0 views</span>}
                          </td>
                          <td className="td">
                            <div className="flex items-center gap-2">
                              <span className="w-16 tabular-nums font-medium">{fmt(p.views)}</span>
                              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(p.views / maxViews) * 100}%` }} /></div>
                            </div>
                          </td>
                          <td className="td tabular-nums text-slate-500">{p.uniqueUsers !== undefined ? fmt(p.uniqueUsers) : '—'}</td>
                          <td className="td tabular-nums">{p.visuals.length}</td>
                          <td className="td tabular-nums">{p.directMeasures.length}</td>
                          <td className="td tabular-nums">{p.parameterMeasures.length > 0 ? <span className="inline-flex items-center gap-1">{p.parameterMeasures.length} <FieldParameterBadge /></span> : 0}</td>
                          <td className="td tabular-nums">{p.dependencyMeasures.length}</td>
                        </tr>
                        {isOpen && <tr><td colSpan={8} className="p-0"><PageDetail p={p} /></td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-xs text-slate-500">* Sum of the unique-user numbers of the rows – not de-duplicated, not an organisation-wide count.</p>
          </section>

          <section className="card mb-4 p-4">
            <h2 className="font-semibold">Measures with the highest potential reach</h2>
            <p className="mb-3 text-xs text-slate-500">Views of all distinct pages where the measure is technically reachable (estimate).</p>
            <ul className="space-y-1.5">
              {top.map(({ m, u }) => (
                <li key={m.id} className="grid grid-cols-[minmax(9rem,14rem)_1fr_auto] items-center gap-3 text-sm">
                  <button className="truncate text-left font-medium hover:text-blue-600" onClick={() => selectMeasure(m.id)}>{m.name}</button>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(u.pageViewsPotential / (top[0]?.u.pageViewsPotential || 1)) * 100}%` }} /></div>
                  <span className="flex items-center gap-2"><span className="tabular-nums">{fmt(u.pageViewsPotential)}</span><UsageLevelBadge level={u.usageStatus} /></span>
                </li>
              ))}
            </ul>
          </section>

          {usage.unmatched.length > 0 && (
            <section className="card mb-4">
              <div className="border-b border-slate-200 p-4 dark:border-slate-800">
                <h2 className="font-semibold text-amber-700 dark:text-amber-300">Usage rows without a matching page</h2>
                <p className="text-xs text-slate-500">Pages are matched by page ID or exact name (case- and extra-space-insensitive). Nothing is guessed.</p>
              </div>
              <div className="overflow-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead><tr><th className="th">Page in file</th><th className="th">Report</th><th className="th">Views</th><th className="th">Why</th></tr></thead>
                  <tbody>
                    {usage.unmatched.map((u) => (
                      <tr key={`${u.report}-${u.page}-${u.reason}`}><td className="td">{u.page || '—'}</td><td className="td text-slate-500">{u.report ?? '—'}</td><td className="td tabular-nums">{fmt(u.views)}</td><td className="td text-xs text-slate-500">{REASON[u.reason]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
