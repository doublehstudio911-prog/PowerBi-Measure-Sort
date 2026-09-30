import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { VISUAL_CATEGORIES } from '../../engine';
import type { Visual } from '../../types/powerbi';
import { EmptyState, FieldParameterBadge, PageHeader, Select, UsageDisclaimer } from '../common/ui';
import { VisualForm } from './VisualForm';

export function VisualsPage() {
  const { analysis, model, updateModel, query, filters, setFilters, selectMeasure } = useApp();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => [...analysis.visuals.values()].filter((v) => {
    if (filters.page && v.page !== filters.page) return false;
    if (filters.visualType && v.category !== filters.visualType) return false;
    if (!q) return true;
    return v.name.toLowerCase().includes(q) || v.page.toLowerCase().includes(q) || v.type.toLowerCase().includes(q) ||
      v.measures.some((m) => m.toLowerCase().includes(q)) || v.columns.some((c) => `${c.table}[${c.column}]`.toLowerCase().includes(q));
  }), [analysis, filters, q]);

  const save = (v: Visual) => {
    updateModel((m) => {
      const exists = m.visuals.some((x) => x.id === v.id);
      return { ...m, visuals: exists ? m.visuals.map((x) => (x.id === v.id ? v : x)) : [...m.visuals, v] };
    });
    setEditing(null);
  };
  const modelVisual = (id: string) => model.visuals.find((v, i) => (v.id || `${v.page}/${v.name}#${i}`) === id);

  return (
    <>
      <PageHeader
        title="Visuals"
        subtitle={`${rows.length} of ${analysis.summary.visuals} visuals on ${analysis.summary.pages} pages`}
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={14} /> Add visual</button>}
      />
      {analysis.usage.hasData && <UsageDisclaimer className="mb-3" />}
      {editing === 'new' && <div className="mb-4"><VisualForm onSave={save} onCancel={() => setEditing(null)} /></div>}
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <Select value={filters.page} onChange={(v) => setFilters({ page: v })} placeholder="All pages" options={analysis.pages.map((p) => ({ value: p, label: p }))} />
          <Select value={filters.visualType} onChange={(v) => setFilters({ visualType: v as typeof filters.visualType })} placeholder="All visual types" options={VISUAL_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </div>
        {rows.length === 0 ? <EmptyState title="No visuals" hint="Add visuals manually or import a report layout." /> : (
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead><tr><th className="th">Page</th><th className="th">Visual</th><th className="th">Type</th><th className="th">Measures</th><th className="th">Columns</th><th className="th">Field parameters</th>{analysis.usage.hasData && <th className="th" title="Views of the report page this visual is on (page level, not per visual)">Page views</th>}<th className="th" title="Measures reachable from this visual: direct, field-parameter members and their dependencies">Reaches</th><th className="th" /></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    {editing === v.id ? (
                      <td className="td" colSpan={9}>
                        <VisualForm initial={modelVisual(v.id) ? { ...modelVisual(v.id)!, id: v.id } : undefined} onSave={save} onCancel={() => setEditing(null)} />
                      </td>
                    ) : (
                      <>
                        <td className="td text-slate-500">{v.page}</td>
                        <td className="td font-medium text-slate-900 dark:text-white">{v.name}</td>
                        <td className="td"><span className="badge bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{v.type}</span></td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {v.measures.map((m) => (
                              <button key={m} onClick={() => selectMeasure(m)} className="badge bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/15 dark:text-blue-300">{analysis.measures.get(m)?.name ?? m}</button>
                            ))}
                            {v.unresolved.map((u) => <span key={u} className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title="Not found in model">{u} ?</span>)}
                          </div>
                        </td>
                        <td className="td text-xs text-slate-500">{v.columns.map((c) => `${c.table}[${c.column}]`).join(', ')}</td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {v.fieldParameters.map((f) => <span key={f} className="inline-flex items-center gap-1"><FieldParameterBadge /><span className="text-xs">{analysis.fieldParameters.get(f)?.name}</span></span>)}
                          </div>
                        </td>
                        {analysis.usage.hasData && <td className="td tabular-nums text-slate-500">{(analysis.usage.visualPageViews.get(v.id) ?? 0).toLocaleString('en-US')}</td>}
                        <td className="td tabular-nums text-slate-500" title="Measures reachable from this visual, incl. dependencies">{v.reachableMeasures.length}</td>
                        <td className="td whitespace-nowrap text-right">
                          <button className="btn px-2" aria-label="Edit visual" onClick={() => setEditing(v.id)}><Pencil size={13} /></button>{' '}
                          <button className="btn btn-danger px-2" aria-label="Delete visual" onClick={() => updateModel((m) => ({ ...m, visuals: m.visuals.filter((x, i) => (x.id || `${x.page}/${x.name}#${i}`) !== v.id) }))}><Trash2 size={13} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
