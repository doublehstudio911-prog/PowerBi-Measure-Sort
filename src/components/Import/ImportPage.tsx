import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileJson, FolderOpen, Upload, XCircle } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { demoModel } from '../../data/demoData';
import { importers } from '../../import/registry';
import { collectDropped, type PathedFile } from '../../import/dropFiles';
import { isUsageFileName } from '../../import/usageMetrics';
import { UsageImportPanel } from './UsageImportPanel';
import { mergeModels, processSources, readFileText, toSource } from '../../import/registry';
import type { ImportSource } from '../../import/types';
import { downloadBlob } from '../../utils/export';
import { PageHeader } from '../common/ui';

export function ImportPage() {
  const { setModel, navigate, model, currentProject, createProject, closeProject } = useApp();
  const [projName, setProjName] = useState('');
  const [saveIt, setSaveIt] = useState(true);
  const [usageFile, setUsageFile] = useState<File | null>(null);
  const [keepUsage, setKeepUsage] = useState(true);
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [paste, setPaste] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  /** `fromFolder`: unknown / irrelevant files are skipped silently instead of being listed as errors */
  const readFiles = async (allFiles: PathedFile[], fromFolder = false) => {
    // CSV / Excel files are usage metrics: hand them to the usage panel (mapping + preview)
    const usage = allFiles.find((f) => isUsageFileName(f.path));
    if (usage) setUsageFile(usage.file);
    const files = allFiles.filter((f) => !isUsageFileName(f.path));
    const list = files.filter((f) => !fromFolder || (/\.(tmdl|json|bim)$/i.test(f.path) && !/(^|[\\/])\.pbi[\\/]/.test(f.path)));
    const res: ImportSource[] = [];
    for (const f of list) res.push(toSource(f.path, await readFileText(f.file), fromFolder));
    setSources((cur) => [...cur, ...res]);
  };
  const fromInput = (fl: FileList, folderMode: boolean) =>
    readFiles(Array.from(fl).map((file) => ({ file, path: file.webkitRelativePath || file.name })), folderMode);
  // Cross-file logic (e.g. PBIR page names) needs all sources at once
  const { outcomes, model: combined } = useMemo(() => processSources(sources), [sources]);
  const measureCount = combined?.tables.reduce((a, t) => a + t.measures.length, 0) ?? 0;

  const firstName = sources[0]?.fileName.split(/[\\/]/)[0]?.replace(/\.(tmdl|json|bim|SemanticModel|Report)$/i, '') ?? '';
  const defaultName = combined?.name || firstName || 'Imported model';
  const merging = mode === 'merge' && !!currentProject;

  const apply = async () => {
    if (!combined) return;
    if (merging) {
      setModel(mergeModels(model, combined)); // autosaved into the open project
    } else if (mode === 'merge') {
      setModel(mergeModels(model, combined));
    } else {
      // replacing the model keeps already loaded usage metrics unless the user opts out
      const next = keepUsage && !combined.usageMetrics && model.usageMetrics ? { ...combined, usageMetrics: model.usageMetrics, usageMeta: model.usageMeta } : combined;
      if (saveIt) {
        await createProject(projName.trim() || defaultName, next);
      } else {
        closeProject();
        setModel(next);
      }
    }
    setSources([]);
    setProjName('');
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
            onDrop={(e) => { e.preventDefault(); setDrag(false); void collectDropped(e.dataTransfer).then((d) => readFiles(d.files, d.hadFolder)); }}
            role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          >
            <Upload className="text-blue-500" />
            <div className="font-medium">Drop files or a whole folder here, or click to browse</div>
            <div className="text-sm text-slate-500">JSON, <code>model.bim</code>, <code>.tmdl</code>, PBIR <code>visual.json</code> – or a usage-metrics <code>.csv</code>/<code>.xlsx</code>. Select several files at once (e.g. all TMDL tables + the report).</div>
            <button type="button" className="btn mt-2" onClick={(e) => { e.stopPropagation(); folder.current?.click(); }}><FolderOpen size={14} /> Select PBIP folder</button>
            <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && void fromInput(e.target.files, false).then(() => { e.target.value = ''; })} />
            <input ref={folder} type="file" hidden onChange={(e) => e.target.files && void fromInput(e.target.files, true).then(() => { e.target.value = ''; })} {...({ webkitdirectory: '', directory: '' } as object)} />
          </div>

          <div className="card p-4">
            <label className="label" htmlFor="paste">…or paste JSON</label>
            <textarea id="paste" className="input font-mono text-xs" rows={6} value={paste} placeholder='{ "tables": [ … ], "visuals": [ … ] }' onChange={(e) => setPaste(e.target.value)} spellCheck={false} />
            <button className="btn mt-2" disabled={!paste.trim()} onClick={() => { setSources((c) => [...c, toSource('pasted.json', paste)]); setPaste(''); }}>Analyse pasted JSON</button>
          </div>

          <UsageImportPanel incoming={usageFile} onConsumed={() => setUsageFile(null)} />

          {outcomes.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 font-semibold">Detected files</h2>
              <ul className="max-h-96 space-y-2 overflow-auto">
                {outcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {o.result ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-500" /> : <XCircle size={16} className="mt-0.5 text-red-500" />}
                    <div>
                      <div><b>{o.fileName}</b> {o.importer && <span className="text-slate-500">· {o.importer.label}</span>}</div>
                      <div className="text-xs text-slate-500">{o.result ? o.result.notes.join(' · ') : o.error}</div>
                    </div>
                    <button className="ml-auto text-xs text-slate-400 hover:text-red-500" onClick={() => setSources((c) => c.filter((x) => x.fileName !== o.fileName))}>remove</button>
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
                  {!merging && mode === 'replace' && (
                    <>
                      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} /> Save as project</label>
                      {saveIt && <input className="input w-56" aria-label="Project name" placeholder={defaultName} value={projName} onChange={(e) => setProjName(e.target.value)} />}
                    </>
                  )}
                  {!merging && mode === 'replace' && model.usageMetrics && (
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={keepUsage} onChange={(e) => setKeepUsage(e.target.checked)} /> Keep loaded usage metrics</label>
                  )}
                  {merging && <span className="text-xs text-slate-500">Merged into “{currentProject?.name}” and saved automatically.</span>}
                  <button className="btn btn-primary" onClick={() => void apply()}>Import &amp; analyse</button>
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
