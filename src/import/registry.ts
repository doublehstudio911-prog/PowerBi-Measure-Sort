import type { ReportModel } from '../types/powerbi';
import { nativeJsonImporter } from './nativeJson';
import { reportLayoutImporter } from './reportLayout';
import { tmslImporter } from './tmsl';
import type { ImportResult, ImportSource, ReportImporter } from './types';

/** Order matters: most specific first. Register future importers (PBIP, XMLA, …) here. */
export const importers: ReportImporter[] = [tmslImporter, reportLayoutImporter, nativeJsonImporter];

export function detectImporter(src: ImportSource): ReportImporter | null {
  return importers.find((i) => i.detect(src)) ?? null;
}

export function toSource(fileName: string, text: string): ImportSource {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { fileName, text, json };
}

export interface FileImportOutcome {
  fileName: string;
  importer?: ReportImporter;
  result?: ImportResult;
  error?: string;
}

export function importSource(src: ImportSource): FileImportOutcome {
  if (src.json === undefined) return { fileName: src.fileName, error: 'Not valid JSON.' };
  const importer = detectImporter(src);
  if (!importer) return { fileName: src.fileName, error: 'Unknown format – no importer recognised this file.' };
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
  for (const m of models) {
    name ??= m.name;
    for (const t of m.tables) {
      const cur = tables.get(t.name);
      if (!cur) {
        tables.set(t.name, { ...t, measures: [...t.measures], columns: [...t.columns] });
        continue;
      }
      for (const me of t.measures) if (!cur.measures.some((x) => x.name === me.name)) cur.measures.push(me);
      for (const c of t.columns) if (!cur.columns.some((x) => x.name === c.name)) cur.columns.push(c);
    }
    for (const v of m.visuals) visuals.set(v.id, v);
  }
  return { name, tables: [...tables.values()], visuals: [...visuals.values()] };
}

/** Decodes a file, honouring UTF-8/UTF-16 BOMs (PBIX Layout is UTF-16LE). */
export async function readFileText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  const text = new TextDecoder('utf-8').decode(buf);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
