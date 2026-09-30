import type { ReportModel } from '../types/powerbi';
import { nativeJsonImporter } from './nativeJson';
import { reportLayoutImporter } from './reportLayout';
import { tmslImporter } from './tmsl';
import { tmdlImporter } from './tmdl';
import { projectFileImporter } from './projectFile';
import { pbirPageImporter, pbirVisualImporter } from './pbir';
import type { ImportResult, ImportSource, ReportImporter } from './types';

/** Order matters: most specific first. Register future importers (PBIP, XMLA, …) here. */
export const importers: ReportImporter[] = [projectFileImporter, tmdlImporter, tmslImporter, pbirVisualImporter, pbirPageImporter, reportLayoutImporter, nativeJsonImporter];

export function detectImporter(src: ImportSource): ReportImporter | null {
  return importers.find((i) => i.detect(src)) ?? null;
}

export function toSource(fileName: string, text: string, optional = false): ImportSource {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { fileName, text, json, optional };
}

export interface FileImportOutcome {
  fileName: string;
  importer?: ReportImporter;
  result?: ImportResult;
  error?: string;
}

export function importSource(src: ImportSource): FileImportOutcome {
  const importer = detectImporter(src);
  if (!importer) {
    return { fileName: src.fileName, error: src.json === undefined ? 'Not valid JSON and not a .tmdl file.' : 'Unknown format – no importer recognised this file.' };
  }
  try {
    return { fileName: src.fileName, importer, result: importer.parse(src) };
  } catch (e) {
    return { fileName: src.fileName, importer, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Combines several partial models (e.g. model.bim + report layout). Tables merge by name, measures by name. */
export function mergeModels(...models: ReportModel[]): ReportModel {
  const tables = new Map<string, ReportModel['tables'][number]>();
  const visuals = new Map<string, ReportModel['visuals'][number]>();
  let name: string | undefined;
  let usageMetrics: ReportModel['usageMetrics'];
  let usageMeta: ReportModel['usageMeta'];
  for (const m of models) {
    name ??= m.name;
    // usage data: the last model that carries some wins (imports never silently drop the loaded data)
    if (m.usageMetrics) usageMetrics = m.usageMetrics;
    if (m.usageMeta) usageMeta = m.usageMeta;
    for (const t of m.tables) {
      const cur = tables.get(t.name);
      if (!cur) {
        tables.set(t.name, { ...t, measures: [...t.measures], columns: [...t.columns] });
        continue;
      }
      if (!cur.dax && t.dax) cur.dax = t.dax;
      for (const me of t.measures) if (!cur.measures.some((x) => x.name === me.name)) cur.measures.push(me);
      for (const c of t.columns) if (!cur.columns.some((x) => x.name === c.name)) cur.columns.push(c);
    }
    for (const v of m.visuals) visuals.set(v.id, v);
  }
  return { name, tables: [...tables.values()], visuals: [...visuals.values()], ...(usageMetrics ? { usageMetrics } : {}), ...(usageMeta ? { usageMeta } : {}) };
}

/** Decodes a file, honouring UTF-8/UTF-16 BOMs (PBIX Layout is UTF-16LE). */
export async function readFileText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  const text = new TextDecoder('utf-8').decode(buf);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Runs all sources through the importers and merges the result. Cross-file logic lives here
 * (e.g. PBIR page.json display names). Unrecognised files from folder uploads are dropped silently.
 */
export function processSources(sources: ImportSource[]): { outcomes: FileImportOutcome[]; model: ReportModel | null } {
  const outcomes = sources.map(importSource).filter((o, i) => !(o.error && sources[i].optional));
  const ok = outcomes.filter((o) => o.result);
  if (!ok.length) return { outcomes, model: null };
  const pageNames: Record<string, string> = Object.assign({}, ...ok.map((o) => o.result!.pageNames ?? {}));
  const merged = mergeModels(...ok.map((o) => o.result!.model));
  merged.visuals = merged.visuals.map((v) => (pageNames[v.page] ? { ...v, pageId: v.pageId ?? v.page, page: pageNames[v.page] } : v));
  return { outcomes, model: merged };
}
