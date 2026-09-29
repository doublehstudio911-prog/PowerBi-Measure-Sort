import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, CircleAlert, FolderOpen, Loader2, Moon, Ruler, Search, Sun, Table2, FileText, Menu } from 'lucide-react';
import { useApp, type View } from '../../state/AppState';
import { globalSearch } from '../../utils/filtering';
import { StatusBadge } from '../common/ui';

const MOBILE_NAV: View[] = ['dashboard', 'measures', 'dependencies', 'unused', 'visuals', 'tables', 'import', 'settings'];

export function Topbar() {
  const { currentProject, saveStatus, analysis, query, setQuery, navigate, selectMeasure, theme, setTheme, view, setFilters } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => globalSearch(analysis, query), [analysis, query]);
  const total = hits.measures.length + hits.tables.length + hits.visuals.length + hits.pages.length;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const Row = ({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={() => { onClick(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
      <span className="text-slate-400">{icon}</span>{children}
    </button>
  );

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="lg:hidden">
        <label className="sr-only" htmlFor="mobile-nav">Navigation</label>
        <div className="relative">
          <Menu size={16} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <select id="mobile-nav" className="input w-auto pl-8" value={view} onChange={(e) => navigate(e.target.value as View)}>
            {MOBILE_NAV.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="relative max-w-xl flex-1" ref={ref}>
        <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search measures, tables, DAX, visuals, pages…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-label="Global search"
        />
        {open && query.trim() && (
          <div className="card absolute left-0 right-0 top-11 z-40 max-h-[70vh] overflow-auto p-2 shadow-xl">
            {total === 0 && <div className="px-3 py-4 text-sm text-slate-500">No results for “{query}”.</div>}
            {hits.measures.length > 0 && <div className="px-2 pt-1 text-[11px] font-semibold uppercase text-slate-400">Measures</div>}
            {hits.measures.map((m) => (
              <Row key={m.id} icon={<Ruler size={14} />} onClick={() => { selectMeasure(m.id); }}>
                <span className="font-medium">{m.name}</span><span className="text-xs text-slate-500">{m.table}</span>
                <span className="ml-auto"><StatusBadge status={m.status} /></span>
              </Row>
            ))}
            {hits.tables.length > 0 && <div className="px-2 pt-2 text-[11px] font-semibold uppercase text-slate-400">Tables</div>}
            {hits.tables.map((t) => <Row key={t} icon={<Table2 size={14} />} onClick={() => { setFilters({ table: t }); navigate('measures'); }}>{t}</Row>)}
            {hits.visuals.length > 0 && <div className="px-2 pt-2 text-[11px] font-semibold uppercase text-slate-400">Visuals</div>}
            {hits.visuals.map((v) => (
              <Row key={v.id} icon={<BarChart3 size={14} />} onClick={() => navigate('visuals')}>{v.name}<span className="text-xs text-slate-500">{v.page}</span></Row>
            ))}
            {hits.pages.length > 0 && <div className="px-2 pt-2 text-[11px] font-semibold uppercase text-slate-400">Pages</div>}
            {hits.pages.map((p) => <Row key={p} icon={<FileText size={14} />} onClick={() => { setFilters({ page: p }); navigate('measures'); }}>{p}</Row>)}
            <div className="mt-1 border-t border-slate-100 px-2 pt-2 text-xs text-slate-500 dark:border-slate-800">
              The search term also filters the Measures, Unused, Visuals and Tables lists.
            </div>
          </div>
        )}
      </div>
      <button
        className="btn ml-auto max-w-56"
        onClick={() => navigate('projects')}
        title={currentProject ? 'Changes are saved automatically in this browser. Click to manage projects.' : 'Not saved – click to save this model as a project'}
      >
        <FolderOpen size={15} className="shrink-0" />
        <span className="truncate">{currentProject ? currentProject.name : 'Unsaved'}</span>
        {saveStatus === 'saving' && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
        {saveStatus === 'saved' && <Check size={14} className="shrink-0 text-emerald-500" />}
        {saveStatus === 'error' && <CircleAlert size={14} className="shrink-0 text-red-500" />}
      </button>
      <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}
