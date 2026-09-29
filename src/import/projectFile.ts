import type { ReportModel } from '../types/powerbi';
import { PROJECT_FORMAT } from '../state/projectStore';
import { normalizeTables, normalizeVisuals } from './nativeJson';
import type { ImportResult, ImportSource, ReportImporter } from './types';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A project file exported by this tool (contains tables *and* visuals). Must be checked before the TMSL importer. */
export const projectFileImporter: ReportImporter = {
  id: 'project-file',
  label: 'Analyzer project file',
  description: 'A project exported from this tool (Projects → Export).',
  detect: (src: ImportSource) => isObj(src.json) && src.json.format === PROJECT_FORMAT && isObj(src.json.model),
  parse(src): ImportResult {
    const root = src.json as Obj;
    const m = root.model as Obj;
    const model: ReportModel = { name: typeof root.name === 'string' ? root.name : undefined, tables: normalizeTables(m.tables), visuals: normalizeVisuals(m) };
    return { model, notes: [`${model.tables.length} tables, ${model.visuals.length} visuals`] };
  },
};
