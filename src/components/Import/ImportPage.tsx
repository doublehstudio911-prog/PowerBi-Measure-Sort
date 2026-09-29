import { useRef, useState } from 'react';
import { CheckCircle2, FileJson, Upload, XCircle } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { demoModel } from '../../data/demoData';
import { importers } from '../../import/registry';
import { importSource, mergeModels, readFileText, toSource, type FileImportOutcome } from '../../import/registry';
import type { ReportModel } from '../../types/powerbi';
import { downloadBlob } from '../../utils/export';
import { PageHeader } from '../common/ui';

export function ImportPage() {
  const { setModel, navigate, model } = useApp();
  const [outcomes, setOutcomes] = useState<FileImportOutcome[]>([]);
  const [paste, setPaste] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const readFiles = async (files: FileList | File[]) => {
    const res: FileImportOutcome[] = [];
    for (const f of Array.from(files)) res.push(importSource(toSource(f.name, await readFileText(f))));
    setOutcomes((cur) => [...cur, ...res]);
  };
  const ok = outcomes.filter((o) => o.result);
  const combined: ReportModel | null = ok.length ? mergeModels(...ok.map((o) => o.result!.model)) : null;
  const measureCount = combined?.tables.reduce((a, t) => a + t.measures.length, 0) ?? 0;

  const apply = () => {
    if (!combined) return;
    setModel(mode === 'merge' ? mergeModels(model, combined) : combined);
    setOutcomes([]);
    navigate('dashboard');
  };

  return (
    <>
      <PageHeader title="Import" subtitle="Import report metadata from files. Files are parsed locally in your browser – nothing is uploaded." />

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div
            className={`card flex cursor-pointer flex-col items-center gap-2 border-dashed p-10 text-center transition ${drag ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void readFiles(e.dataTransfer.files); }}
            role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          >
            <Upload className="text-blue-500" />
            <div className="font-medium">Drop JSON files here or click to browse</div>
            <div className="text-sm text-slate-500">You can select several files at once, e.g. <code>model.bim</code> + report <code>Layout</code>.</div>
            <input ref={input} type="file" accept=".json,.bim,.txt,*" multiple hidden onChange={(e) => e.target.files && void readFiles(e.target.files)} />
          </div>

          <div className="card p-4">
            <label className="label" htmlFor="paste">…or paste JSON</label>
            <textarea id="paste" className="input font-mono text-xs" rows={6} value={paste} placeholder='{ "tables": [ … ], "visuals": [ … ] }' onChange={(e) => setPaste(e.target.value)} spellCheck={false} />
            <button className="btn mt-2" disabled={!paste.trim()} onClick={() => { setOutcomes((c) => [...c, importSource(toSource('pasted.json', paste))]); setPaste(''); }}>Analyse pasted JSON</button>
          </div>

          {outcomes.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 font-semibold">Detected files</h2>
              <ul className="space-y-2">
                {outcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {o.result ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-500" /> : <XCircle size={16} className="mt-0.5 text-red-500" />}
                    <div>
                      <div><b>{o.fileName}</b> {o.importer && <span className="text-slate-500">· {o.importer.label}</span>}</div>
                      <div className="text-xs text-slate-500">{o.result ? o.result.notes.join(' · ') : o.error}</div>
                    </div>
                    <button className="ml-auto text-xs text-slate-400 hover:text-red-500" onClick={() => setOutcomes((c) => c.filter((_, j) => j !== i))}>remove</button>
                  </li>
                ))}
              </ul>
              {combined && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{combined.tables.length} tables · {measureCount} measures · {combined.visuals.length} visuals</span>
                  <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Import mode">
                    <option value="replace">Replace current model</option>
                    <option value="merge">Merge into current model</option>
                  </select>
                  <button className="btn btn-primary" onClick={apply}>Import &amp; analyse</button>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Supported formats</h2>
            <ul className="space-y-3 text-sm">
              {importers.map((i) => (
                <li key={i.id}><div className="font-medium">{i.label}</div><div className="text-xs text-slate-500">{i.description}</div></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Importers are pluggable (<code>src/import/registry.ts</code>) – a real PBIX/PBIP/XMLA import can be added without touching the analysis engine.</p>
          </div>
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Example</h2>
            <button className="btn w-full justify-center" onClick={() => downloadBlob('example-model.json', JSON.stringify(demoModel, null, 2), 'application/json')}>
              <FileJson size={14} /> Download example JSON
            </button>
            <pre className="code mt-3 max-h-56 text-[11px]">{`{
  "tables": [{
    "name": "Sales",
    "measures": [
      { "name": "Revenue", "dax": "SUM(Sales[Amount])" },
      { "name": "Margin",  "dax": "[Revenue] - [Cost]" }
    ]
  }],
  "visuals": [{
    "page": "Overview",
    "name": "Revenue Card",
    "type": "Card",
    "measures": ["[Revenue]"]
  }]
}`}</pre>
            <p className="mt-2 text-xs text-slate-500">No file? Use the <b>Tables</b> and <b>Visuals</b> pages to enter everything manually.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
