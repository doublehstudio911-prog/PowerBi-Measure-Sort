import { useApp } from '../../state/AppState';
import { PageHeader } from '../common/ui';
import { ExportMenu } from '../common/ExportMenu';

export function SettingsPage() {
  const { theme, setTheme, loadDemo, clearModel, analysis } = useApp();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-2xl space-y-4">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Appearance</h2>
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} className={`btn ${theme === t ? 'btn-primary' : ''}`} onClick={() => setTheme(t)}>{t === 'light' ? 'Light' : 'Dark'}</button>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Data</h2>
          <p className="mb-3 text-sm text-slate-500">The model is stored only in this browser (localStorage). Nothing is transmitted to any server.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={loadDemo}>Load demo data</button>
            <button className="btn btn-danger" onClick={() => { if (confirm('Remove all tables, measures and visuals?')) clearModel(); }}>Clear model</button>
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Export</h2>
          <ExportMenu />
        </section>
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">How usage is determined</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li><b>Direct</b>: a visual references the measure.</li>
            <li><b>Indirect</b>: a used measure references it (recursively). Calculated-column DAX also keeps measures alive.</li>
            <li><b>Unused</b>: neither. A measure that is referenced only by other unused measures is unused too.</li>
            <li><code>[Name]</code> resolves to a measure whenever one exists (conservative: avoids false “unused”); <code>Table[Name]</code> resolves to the column if the table has such a column and no such measure.</li>
            <li>Comments, string literals and VAR names are ignored.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">{analysis.summary.totalMeasures} measures analysed · {analysis.warnings.length} warnings</p>
        </section>
      </div>
    </>
  );
}
