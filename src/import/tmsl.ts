import type { ReportModel } from '../types/powerbi';
import { normalizeTables } from './nativeJson';
import type { ImportResult, ImportSource, ReportImporter } from './types';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

function findModel(json: unknown): Obj | null {
  if (!isObj(json)) return null;
  if (isObj(json.model) && Array.isArray(json.model.tables)) return json.model;
  // TMSL script: { createOrReplace: { database: { model } } }
  const db = isObj(json.createOrReplace) ? (json.createOrReplace as Obj).database : undefined;
  if (isObj(db) && isObj(db.model) && Array.isArray(db.model.tables)) return db.model;
  return null;
}

/**
 * Tabular model definitions: `model.bim` (Tabular Editor / PBIP `definition/model.bim`),
 * TMSL scripts and `Get-TabularModel` JSON exports. Measures have an `expression` (string or string[]).
 */
export const tmslImporter: ReportImporter = {
  id: 'tmsl-bim',
  label: 'Tabular model (model.bim / TMSL)',
  description: 'Tables, columns, measures and calculated columns from a .bim file or TMSL JSON. Contains no visuals – combine with a report layout file.',
  detect: (src: ImportSource) => findModel(src.json) !== null,
  parse(src): ImportResult {
    const m = findModel(src.json)!;
    const model: ReportModel = { name: typeof m.name === 'string' ? m.name : undefined, tables: normalizeTables(m.tables), visuals: [] };
    // Hidden auto-generated date tables are noise
    model.tables = model.tables.filter((t) => !/^(LocalDateTable_|DateTableTemplate_)/.test(t.name));
    return { model, notes: [`${model.tables.length} tables, ${model.tables.reduce((a, t) => a + t.measures.length, 0)} measures`] };
  },
};
