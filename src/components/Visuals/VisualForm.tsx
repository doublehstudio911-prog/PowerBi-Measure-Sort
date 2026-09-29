import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useApp } from '../../state/AppState';
import type { Visual } from '../../types/powerbi';

const TYPES = ['Card', 'KPI', 'Table', 'Matrix', 'Clustered Column Chart', 'Line Chart', 'Bar Chart', 'Pie Chart', 'Slicer', 'Gauge', 'Other'];

/** Simple create/edit form; measures are assigned by ticking them in a searchable list. */
export function VisualForm({ initial, onSave, onCancel }: { initial?: Visual; onSave: (v: Visual) => void; onCancel: () => void }) {
  const { analysis, model } = useApp();
  const [page, setPage] = useState(initial?.page ?? analysis.pages[0] ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'Card');
  const [measures, setMeasures] = useState<Set<string>>(() => new Set(initial ? [...analysis.visuals.get(initial.id)?.measures ?? []] : []));
  const [columns, setColumns] = useState((initial?.columns ?? []).join(', '));
  const [filter, setFilter] = useState('');

  const options = useMemo(
    () => analysis.measureOrder.filter((id) => id.toLowerCase().includes(filter.toLowerCase())),
    [analysis, filter],
  );
  const valid = page.trim() && name.trim();

  const save = () => {
    // Unresolved raw references are preserved verbatim
    const unresolved = initial ? analysis.visuals.get(initial.id)?.unresolved ?? [] : [];
    onSave({
      id: initial?.id ?? `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      page: page.trim(),
      name: name.trim(),
      type,
      measures: [...measures, ...unresolved],
      columns: columns.split(',').map((c) => c.trim()).filter(Boolean),
      fields: initial?.fields.filter((f) => !analysis.measures.has(f)) ?? [],
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-500/30 dark:bg-blue-500/5">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="v-page">Report page</label>
          <input id="v-page" className="input" list="page-list" value={page} onChange={(e) => setPage(e.target.value)} placeholder="e.g. Overview" />
          <datalist id="page-list">{analysis.pages.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="v-name">Visual name</label>
          <input id="v-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Revenue Card" />
        </div>
        <div>
          <label className="label" htmlFor="v-type">Visual type</label>
          <input id="v-type" className="input" list="type-list" value={type} onChange={(e) => setType(e.target.value)} />
          <datalist id="type-list">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </div>
      <div>
        <label className="label">Measures used by this visual ({measures.size} selected)</label>
        <input className="input mb-2" placeholder="Filter measures…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {model.tables.every((t) => t.measures.length === 0) && <div className="p-3 text-sm text-slate-500">No measures yet – add some on the Tables page.</div>}
          {options.map((id) => (
            <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                checked={measures.has(id)}
                onChange={(e) => setMeasures((s) => { const n = new Set(s); if (e.target.checked) n.add(id); else n.delete(id); return n; })}
              />
              <span className="font-medium">{analysis.measures.get(id)!.name}</span>
              <span className="text-xs text-slate-400">{analysis.measures.get(id)!.table}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="v-cols">Columns (comma separated, e.g. Sales[Region], Date[Year])</label>
        <input id="v-cols" className="input" value={columns} onChange={(e) => setColumns(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!valid} onClick={save}><Check size={14} /> Save visual</button>
        <button className="btn" onClick={onCancel}><X size={14} /> Cancel</button>
      </div>
    </div>
  );
}
