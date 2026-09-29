import { BarChart3, Boxes, FolderOpen, GitFork, LayoutDashboard, Ruler, Settings, Table2, Trash2, Upload } from 'lucide-react';
import { useApp, type View } from '../../state/AppState';

const NAV: { id: View; label: string; Icon: typeof Settings }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'measures', label: 'Measures', Icon: Ruler },
  { id: 'dependencies', label: 'Dependencies', Icon: GitFork },
  { id: 'unused', label: 'Unused Measures', Icon: Trash2 },
  { id: 'visuals', label: 'Visuals', Icon: BarChart3 },
  { id: 'tables', label: 'Tables', Icon: Table2 },
  { id: 'projects', label: 'Projects', Icon: FolderOpen },
  { id: 'import', label: 'Import', Icon: Upload },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function Sidebar() {
  const { view, navigate, analysis } = useApp();
  const s = analysis.summary;
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="grid size-8 place-items-center rounded-lg bg-blue-600 text-white"><Boxes size={18} /></div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Measure Analyzer</div>
          <div className="text-[11px] text-slate-500">Power BI usage & dependencies</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Icon size={17} />
              <span className="flex-1 text-left">{label}</span>
              {id === 'unused' && s.unusedMeasures > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">{s.unusedMeasures}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
        🔒 Analysis runs locally in your browser. No data is sent anywhere.
      </div>
    </aside>
  );
}
