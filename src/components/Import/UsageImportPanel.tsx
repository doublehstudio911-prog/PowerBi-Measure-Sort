import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, TriangleAlert, XCircle } from 'lucide-react';
import { useApp } from '../../state/AppState';
import {
  detectMapping, extractUsageMetrics, mergeUsage, readUsageTable, USAGE_FIELDS, USAGE_FIELD_LABELS, withoutUsage, type RawTable,
} from '../../import/usageMetrics';
import type { UnmatchedReason, UsageField, UsageMapping } from '../../types/powerbi';
import { UsageDisclaimer } from '../common/ui';

const REASON_TEXT: Record<UnmatchedReason, string> = {
  'page-not-found': 'No page with this name in the model',
  'ambiguous-page': 'Several model pages share this name',
  'other-report': 'Row belongs to a different report',
};
const fmt = (n: number) => n.toLocaleString('en-US');

/** Import, mapping preview and management of usage metrics. Separate from the PBIP/model import: it never touches tables, measures or visuals. */
export function UsageImportPanel({ incoming, onConsumed, onImported }: { incoming: File | null; onConsumed: () => void; onImported?: () => void }) {
  const { model, analysis, updateModel } = useApp();
  const [raw, setRaw] = useState<RawTable | null>(null);
  const [mapping, setMapping] = useState<UsageMapping>({});
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const usage = analysis.usage;

  const load = async (file: File) => {
    setError('');
    try {
      const table = await readUsageTable(file.name, await file.arrayBuffer());
      setRaw(table);
      setMapping(detectMapping(table.headers));
      setTimeout(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setRaw(null);
      setError(e instanceof Error ? e.message : 'The file could not be read.');
      setTimeout(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  useEffect(() => {
    if (incoming) { void load(incoming); onConsumed(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const extraction = useMemo(() => (raw ? extractUsageMetrics(raw, mapping) : null), [raw, mapping]);
  const auto = useMemo(() => (raw ? detectMapping(raw.headers) : {}), [raw]);
  const modelEmpty = model.tables.length === 0 && model.visuals.length === 0;

  const setField = (field: UsageField, header: string) =>
    setMapping((m) => {
      const next = { ...m };
      if (header) next[field] = header; else delete next[field];
      return next;
    });

  const apply = () => {
    if (!raw || !extraction || extraction.errors.length) return;
    const merged = mergeUsage(model, raw, mapping, extraction, mode);
    updateModel((m) => ({ ...m, ...merged }));
    setRaw(null);
    onImported?.();
  };

  const removeUsage = () => {
    if (confirm('Remove all imported usage metrics? Tables, measures and visuals are kept.')) updateModel((m) => withoutUsage(m));
  };
  const setReport = (report: string) =>
    updateModel((m) => ({ ...m, usageMeta: { imports: m.usageMeta?.imports ?? [], reportFilter: report || undefined } }));

  return (
    <section ref={root} className="card p-4" aria-label="Usage metrics import">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Import usage metrics</h2>
        <button className="btn" onClick={() => input.current?.click()}><FileSpreadsheet size={14} /> Choose CSV / Excel</button>
        <input
          ref={input} type="file" accept=".csv,.xlsx,.xls" hidden aria-label="Usage metrics file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }}
        />
      </div>
      <p className="mb-3 text-sm text-slate-500">
        A second data source next to the PBIP model: page views per report page (CSV, XLSX or XLS). The file is parsed locally in your browser and merged with the loaded model – nothing is uploaded and the model is not overwritten.
      </p>
      {error && <div className="mb-3 flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}

      {raw && extraction && (
        <div className="space-y-4">
          <div className="text-sm"><b>{raw.fileName}</b> <span className="text-slate-500">· {raw.format.toUpperCase()}{raw.sheetName ? ` · sheet “${raw.sheetName}”` : ''} · {raw.rows.length} data rows</span></div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Column mapping</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {USAGE_FIELDS.map((field) => (
                <div key={field}>
                  <label className="label" htmlFor={`map-${field}`}>
                    {USAGE_FIELD_LABELS[field]} {mapping[field] !== undefined && mapping[field] === auto[field] && <span className="text-emerald-600">· detected automatically</span>}
                  </label>
                  <select id={`map-${field}`} className="input" value={mapping[field] ?? ''} onChange={(e) => setField(field, e.target.value)}>
                    <option value="">— not mapped —</option>
                    {raw.headers.map((h, i) => <option key={`${h}-${i}`} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[520px] border-collapse">
              <thead><tr><th className="th">Column in file</th><th className="th">Mapped to</th><th className="th">Sample values</th></tr></thead>
              <tbody>
                {extraction.columns.map((c, i) => (
                  <tr key={`${c.header}-${i}`}>
                    <td className="td font-medium">{c.header}</td>
                    <td className="td">{c.field ? <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{USAGE_FIELD_LABELS[c.field]}</span> : <span className="text-slate-400">ignored</span>}</td>
                    <td className="td text-xs text-slate-500">{c.samples.join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-emerald-500" /> {fmt(extraction.validRows)} valid rows</span>
            <span className="flex items-center gap-1.5"><TriangleAlert size={15} className={extraction.skipped.length ? 'text-amber-500' : 'text-slate-400'} /> {fmt(extraction.skipped.length)} skipped rows</span>
            {extraction.blankRows > 0 && <span className="text-slate-500">{fmt(extraction.blankRows)} blank rows ignored</span>}
          </div>
          {extraction.errors.map((e) => <div key={e} className="flex gap-2 text-sm text-red-700 dark:text-red-300"><XCircle size={15} className="mt-0.5 shrink-0" />{e}</div>)}
          {extraction.warnings.map((w) => <div key={w} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{w}</div>)}
          {extraction.skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600 dark:text-slate-300">Show skipped rows</summary>
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs text-slate-500">
                {extraction.skipped.slice(0, 100).map((r) => <li key={r.row}>Row {r.row}: {r.reason}</li>)}
                {extraction.skipped.length > 100 && <li>… and {extraction.skipped.length - 100} more</li>}
              </ul>
            </details>
          )}
          {modelEmpty && <div className="text-sm text-amber-700 dark:text-amber-300">No model is loaded – import a PBIP / model first, otherwise no page can be matched.</div>}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            {usage.hasData && (
              <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value === 'append' ? 'append' : 'replace')} aria-label="Import mode">
                <option value="replace">Replace existing usage metrics</option>
                <option value="append">Add to existing usage metrics</option>
              </select>
            )}
            <button className="btn btn-primary" disabled={extraction.errors.length > 0} onClick={apply}>Import &amp; analyse</button>
            <button className="btn" onClick={() => setRaw(null)}>Cancel</button>
          </div>
        </div>
      )}

      {usage.hasData && (
        <div className={`space-y-3 ${raw ? 'mt-6 border-t border-slate-100 pt-4 dark:border-slate-800' : ''}`}>
          <h3 className="text-sm font-semibold">Loaded usage metrics</h3>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {fmt(usage.totalViews)} views · {usage.pages.length} matched page(s) ({fmt(usage.matchedViews)} views) · {usage.unmatched.length} unmatched ({fmt(usage.unmatchedViews)} views)
          </div>
          <ul className="space-y-0.5 text-xs text-slate-500">
            {(model.usageMeta?.imports ?? []).map((i) => <li key={i.id}>{i.fileName} · {i.validRows} rows{i.skippedRows ? ` (${i.skippedRows} skipped)` : ''} · {new Date(i.importedAt).toLocaleString()}</li>)}
          </ul>
          {usage.availableReports.length > 1 && (
            <div>
              <label className="label" htmlFor="report-filter">The file contains several reports – match against</label>
              <select id="report-filter" className="input w-auto" value={model.usageMeta?.reportFilter ?? usage.activeReport ?? ''} onChange={(e) => setReport(e.target.value)}>
                <option value="">All reports (rows are matched by page only)</option>
                {usage.availableReports.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {usage.unmatched.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium text-amber-700 dark:text-amber-300">Pages that could not be matched</div>
              <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead><tr><th className="th">Page in file</th><th className="th">Report</th><th className="th">Views</th><th className="th">Why</th></tr></thead>
                  <tbody>
                    {usage.unmatched.map((u) => (
                      <tr key={`${u.report}-${u.page}-${u.reason}`}><td className="td">{u.page}</td><td className="td text-slate-500">{u.report ?? '—'}</td><td className="td tabular-nums">{fmt(u.views)}</td><td className="td text-xs text-slate-500">{REASON_TEXT[u.reason]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-slate-500">Pages are matched by page ID when available, otherwise by exact name (case- and extra-space-insensitive). No fuzzy matching.</p>
            </div>
          )}
          {usage.pagesWithoutUsage.length > 0 && <p className="text-xs text-slate-500">Model pages without usage rows: {usage.pagesWithoutUsage.join(', ')}</p>}
          <UsageDisclaimer />
          <button className="btn btn-danger" onClick={removeUsage}>Remove usage metrics</button>
        </div>
      )}
    </section>
  );
}
