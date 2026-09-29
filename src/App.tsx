import { useApp } from './state/AppState';
import { Sidebar } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { Dashboard } from './components/Dashboard/Dashboard';
import { MeasuresPage } from './components/Measures/MeasuresPage';
import { UnusedPage } from './components/Measures/UnusedPage';
import { MeasureDetail } from './components/Measures/MeasureDetail';
import { DependencyGraphPage } from './components/DependencyGraph/DependencyGraphPage';
import { VisualsPage } from './components/Visuals/VisualsPage';
import { TablesPage } from './components/Tables/TablesPage';
import { ImportPage } from './components/Import/ImportPage';
import { ProjectsPage } from './components/Projects/ProjectsPage';
import { SettingsPage } from './components/Settings/SettingsPage';

export default function App() {
  const { view, ready } = useApp();
  if (!ready) return <div className="grid h-full place-items-center text-sm text-slate-500">Loading saved projects…</div>;
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-[1400px]">
            {view === 'dashboard' && <Dashboard />}
            {view === 'measures' && <MeasuresPage />}
            {view === 'dependencies' && <DependencyGraphPage />}
            {view === 'unused' && <UnusedPage />}
            {view === 'visuals' && <VisualsPage />}
            {view === 'tables' && <TablesPage />}
            {view === 'projects' && <ProjectsPage />}
            {view === 'import' && <ImportPage />}
            {view === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>
      <MeasureDetail />
    </div>
  );
}
