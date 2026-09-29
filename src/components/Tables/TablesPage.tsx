import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { CycleBadge, EmptyState, PageHeader, StatusBadge } from '../common/ui';

export function TablesPage() {
  const { model, analysis, updateModel, query, selectMeasure } = useApp();
  const [newTable, setNewTable] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const tables = model.tables.filter((t) => !q || t.name.toLowerCase().includes(q) || t.measures.some((m) => m.name.toLowerCase().includes(q)) || t.columns.some((c) => c.name.toLowerCase().includes(q)));

  const addTable = () => {
    const name = newTable.trim();
    if (!name || model.tables.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    updateModel((m) => ({ ...m, tables: [...m.tables, { name, measures: [], columns: [] }] }));
    setOpen((s) => new Set(s).add(name));
    setNewTable('');
  };
  const patch = (table: string, fn: (t: (typeof model.tables)[number]) => (typeof model.tables)[number]) =>
    updateModel((m) => ({ ...m, tables: m.tables.map((t) => (t.name === table ? fn(t) : t)) }));

  return (
    <>
      <PageHeader title="Tables" subtitle="Tables, measures (with DAX) and columns. Everything is editable – changes are analysed instantly." />
      <div className="card mb-4 flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="new-table">New table</label>
          <input id="new-table" className="input" value={newTable} placeholder="Table name" onChange={(e) => setNewTable(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTable()} />
        </div>
        <button className="btn btn-primary" onClick={addTable} disabled={!newTable.trim()}><Plus size={14} /> Add table</button>
      </div>

      {tables.length === 0 && <div className="card"><EmptyState title="No tables" hint="Create a table above or import a model." /></div>}
      <div className="space-y-3">
        {tables.map((t) => {
          const isOpen = open.has(t.name);
          const info = analysis.tables.get(t.name);
          return (
            <section key={t.name} className="card">
              <button
                className="flex w-full items-center gap-3 p-4 text-left"
                onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(t.name)) n.delete(t.name); else n.add(t.name); return n; })}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-semibold text-slate-900 dark:text-white">{t.name}</span>
                <span className="text-xs text-slate-500">{t.measures.length} measures · {t.columns.length} columns</span>
                {!!info?.unusedMeasureCount && <span className="badge bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">{info.unusedMeasureCount} unused</span>}
              </button>
              {isOpen && (
                <div className="space-y-5 border-t border-slate-100 p-4 dark:border-slate-800">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Measures</h3>
                    <div className="space-y-2">
                      {t.measures.map((me) => {
                        const mi = analysis.measures.get(`${t.name}[${me.name}]`);
                        return (
                          <div key={me.name} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                            <div className="mb-2 flex items-center gap-2">
                              <button className="font-medium hover:text-blue-600" onClick={() => mi && selectMeasure(mi.id)}>{me.name}</button>
                              {mi && <StatusBadge status={mi.status} />}
                              {mi?.inCycle && <CycleBadge />}
                              <button className="btn btn-danger ml-auto px-2" aria-label={`Delete ${me.name}`} onClick={() => patch(t.name, (x) => ({ ...x, measures: x.measures.filter((y) => y.name !== me.name) }))}><Trash2 size={13} /></button>
                            </div>
                            <textarea
                              className="input font-mono text-xs" rows={Math.min(8, Math.max(2, me.dax.split('\n').length))} value={me.dax} spellCheck={false}
                              aria-label={`DAX of ${me.name}`}
                              onChange={(e) => patch(t.name, (x) => ({ ...x, measures: x.measures.map((y) => (y.name === me.name ? { ...y, dax: e.target.value } : y)) }))}
                            />
                          </div>
                        );
                      })}
                      <NewMeasure onAdd={(name, dax) => patch(t.name, (x) => ({ ...x, measures: [...x.measures, { name, dax }] }))} exists={(n) => analysis.measures.has(`${t.name}[${n}]`)} />
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Columns</h3>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {t.columns.map((c) => (
                        <span key={c.name} className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" title={c.calculated ? c.dax : undefined}>
                          {c.name}{c.calculated && ' ƒ'}
                          <button aria-label={`Remove ${c.name}`} onClick={() => patch(t.name, (x) => ({ ...x, columns: x.columns.filter((y) => y.name !== c.name) }))}>×</button>
                        </span>
                      ))}
                      {t.columns.length === 0 && <span className="text-sm text-slate-500">No columns</span>}
                    </div>
                    <NewColumn onAdd={(c) => patch(t.name, (x) => ({ ...x, columns: [...x.columns, c] }))} />
                  </div>
                  <button className="btn btn-danger" onClick={() => updateModel((m) => ({ ...m, tables: m.tables.filter((x) => x.name !== t.name) }))}><Trash2 size={14} /> Delete table</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function NewMeasure({ onAdd, exists }: { onAdd: (name: string, dax: string) => void; exists: (n: string) => boolean }) {
  const [name, setName] = useState('');
  const [dax, setDax] = useState('');
  const dup = exists(name.trim());
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <div className="grid gap-2 md:grid-cols-[14rem_1fr_auto]">
        <input className="input" placeholder="Measure name" aria-label="New measure name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="input font-mono text-xs" rows={2} placeholder="DAX, e.g. DIVIDE([A], [B])" aria-label="New measure DAX" value={dax} spellCheck={false} onChange={(e) => setDax(e.target.value)} />
        <button className="btn btn-primary self-start" disabled={!name.trim() || dup} onClick={() => { onAdd(name.trim(), dax); setName(''); setDax(''); }}><Plus size={14} /> Add measure</button>
      </div>
      {dup && <p className="mt-1 text-xs text-red-500">A measure with this name already exists in the table.</p>}
    </div>
  );
}

function NewColumn({ onAdd }: { onAdd: (c: { name: string; calculated?: boolean; dax?: string }) => void }) {
  const [name, setName] = useState('');
  const [dax, setDax] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      <input className="input w-48" placeholder="Column name" aria-label="New column name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input w-72" placeholder="DAX (optional → calculated column)" aria-label="New column DAX" value={dax} onChange={(e) => setDax(e.target.value)} />
      <button className="btn" disabled={!name.trim()} onClick={() => { onAdd({ name: name.trim(), calculated: !!dax.trim(), dax: dax.trim() || undefined }); setName(''); setDax(''); }}><Plus size={14} /> Add column</button>
    </div>
  );
}
