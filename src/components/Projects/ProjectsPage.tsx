import { useRef, useState } from 'react';
import { Copy, Download, FolderOpen, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { toProjectFile, type ProjectMeta } from '../../state/projectStore';
import { loadProject } from '../../state/projectStore';
import { processSources, readFileText, toSource } from '../../import/registry';
import { downloadBlob } from '../../utils/export';
import { EmptyState, PageHeader } from '../common/ui';

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fileSafe = (s: string) => s.replace(/[^\w\-. äöüÄÖÜß]+/g, '_').trim() || 'project';

export function ProjectsPage() {
  const { projects, currentProject, saveStatus, model, analysis, createProject, openProject, closeProject, removeProject, renameProject, navigate } = useApp();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const hasModel = model.tables.length > 0 || model.visuals.length > 0;

  const guard = async (fn: () => Promise<void>) => {
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Storage failed – is the browser blocking site data?'); }
  };

  const exportProject = async (p: ProjectMeta) => {
    const full = await loadProject(p.id);
    if (full) downloadBlob(`${fileSafe(p.name)}.pbi-analyzer.json`, toProjectFile(p.name, full.model), 'application/json');
  };

  const importFile = (files: FileList | null) => guard(async () => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const { model: m, outcomes } = processSources([toSource(f.name, await readFileText(f))]);
      if (!m) throw new Error(`${f.name}: ${outcomes[0]?.error ?? 'nothing to import'}`);
      await createProject(m.name || f.name.replace(/\.(pbi-analyzer\.)?json$/i, ''), m);
    }
    navigate('dashboard');
  });

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Saved in this browser (IndexedDB) – they survive closing the tab and restarting the dev server / Codespace. Changes to the open project are saved automatically."
        actions={
          <>
            <button className="btn" onClick={() => fileInput.current?.click()}><Upload size={14} /> Open project file</button>
            <input ref={fileInput} type="file" accept=".json" multiple hidden onChange={(e) => { void importFile(e.target.files).then(() => { e.target.value = ''; }); }} />
          </>
        }
      />
      {error && <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</div>}

      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Current model</h2>
          <span className="text-xs text-slate-500">
            {analysis.summary.tables} tables · {analysis.summary.totalMeasures} measures · {analysis.summary.visuals} visuals
          </span>
        </div>
        {currentProject ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Open project: <b>{currentProject.name}</b></span>
            <span className="text-slate-500">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'All changes saved' : saveStatus === 'error' ? 'Saving failed' : ''}</span>
            <button className="btn ml-auto" onClick={closeProject} title="Keep working without saving further changes">Close project</button>
          </div>
        ) : (
          <p className="mb-2 text-sm text-slate-500">This model is not saved yet – it will be lost on reload.</p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="proj-name">{currentProject ? 'Save a copy as' : 'Save as project'}</label>
            <input id="proj-name" className="input" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && hasModel && void guard(async () => { await createProject(name); setName(''); })} />
          </div>
          <button className="btn btn-primary" disabled={!name.trim() || !hasModel} onClick={() => guard(async () => { await createProject(name); setName(''); })}>
            {currentProject ? <Copy size={14} /> : <Save size={14} />} {currentProject ? 'Save copy' : 'Save project'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-slate-200 p-4 font-semibold dark:border-slate-800">Saved projects ({projects.length})</div>
        {projects.length === 0 ? (
          <EmptyState title="No saved projects yet" hint="Import files and they are saved automatically as a project – or save the current model above." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {projects.map((p) => {
              const isCurrent = currentProject?.id === p.id;
              return (
                <li key={p.id} className={`flex flex-wrap items-center gap-3 p-4 ${isCurrent ? 'bg-blue-50/60 dark:bg-blue-500/5' : ''}`}>
                  <div className="min-w-0 flex-1">
                    {editing === p.id ? (
                      <input
                        className="input max-w-sm" autoFocus value={editName} aria-label="Project name"
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editName.trim()) void guard(async () => { await renameProject(p.id, editName.trim()); setEditing(null); });
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        onBlur={() => setEditing(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-900 dark:text-white">{p.name}</span>
                        {isCurrent && <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">OPEN</span>}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">{p.tables} tables · {p.measures} measures · {p.visuals} visuals · saved {fmt(p.savedAt)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="btn btn-primary" disabled={isCurrent} onClick={() => guard(async () => { await openProject(p.id); navigate('dashboard'); })}><FolderOpen size={14} /> Open</button>
                    <button className="btn px-2" aria-label="Rename" title="Rename" onClick={() => { setEditing(p.id); setEditName(p.name); }}><Pencil size={14} /></button>
                    <button className="btn px-2" aria-label="Export project file" title="Export project file (backup / move to another browser)" onClick={() => void exportProject(p)}><Download size={14} /></button>
                    <button className="btn btn-danger px-2" aria-label="Delete" title="Delete" onClick={() => { if (confirm(`Delete project “${p.name}”?`)) void guard(() => removeProject(p.id)); }}><Trash2 size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Storage is per browser and per address (e.g. <code>localhost:5173</code> vs. a Codespaces URL). Use <b>Export</b> to back up a project or move it to another browser, and <b>Open project file</b> to bring it back.
      </p>
    </>
  );
}
