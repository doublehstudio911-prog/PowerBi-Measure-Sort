import type { Column, Measure, ReportModel, Table, Visual } from '../types/powerbi';
import type { ImportResult, ImportSource, ReportImporter } from './types';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const daxText = (x: unknown): string => (Array.isArray(x) ? x.map(str).join('\n') : str(x));

function refToString(x: unknown): string {
  if (typeof x === 'string') return x;
  if (isObj(x)) {
    const name = str(x.name ?? x.measure ?? x.column ?? x.field ?? x.property);
    const table = str(x.table ?? x.entity);
    return table ? `${table}[${name}]` : name;
  }
  return '';
}
const refList = (x: unknown): string[] => (Array.isArray(x) ? x.map(refToString).filter(Boolean) : []);

function normalizeColumn(c: unknown): Column | null {
  if (typeof c === 'string') return { name: c };
  if (!isObj(c) || !str(c.name)) return null;
  const dax = daxText(c.dax ?? c.expression);
  return {
    name: str(c.name),
    calculated: c.calculated === true || str(c.type).toLowerCase() === 'calculated' || (!!dax && c.calculated !== false),
    dax: dax || undefined,
    dataType: str(c.dataType) || undefined,
  };
}

function normalizeMeasure(m: unknown): Measure | null {
  if (!isObj(m) || !str(m.name)) return null;
  return {
    name: str(m.name),
    dax: daxText(m.dax ?? m.expression),
    lastModified: str(m.lastModified ?? m.modifiedTime ?? m.lastUpdate) || undefined,
    description: str(m.description) || undefined,
    displayFolder: str(m.displayFolder) || undefined,
  };
}

export function normalizeTables(tables: unknown): Table[] {
  if (!Array.isArray(tables)) return [];
  const out: Table[] = [];
  for (const t of tables) {
    if (!isObj(t) || !str(t.name)) continue;
    out.push({
      name: str(t.name),
      measures: (Array.isArray(t.measures) ? t.measures : []).map(normalizeMeasure).filter((x): x is Measure => !!x),
      columns: (Array.isArray(t.columns) ? t.columns : []).map(normalizeColumn).filter((x): x is Column => !!x),
    });
  }
  return out;
}

function normalizeVisual(v: unknown, page: string | undefined, n: number): Visual | null {
  if (!isObj(v)) return null;
  const p = str(v.page ?? v.pageName ?? v.section) || page || 'Page 1';
  const name = str(v.name ?? v.title ?? v.id) || `Visual ${n + 1}`;
  return {
    id: str(v.id) || `${p}/${name}#${n}`,
    page: p,
    name,
    type: str(v.type ?? v.visualType) || 'Other',
    measures: refList(v.measures),
    columns: refList(v.columns),
    fields: refList(v.fields),
  };
}

export function normalizeVisuals(root: Obj): Visual[] {
  const out: Visual[] = [];
  let n = 0;
  if (Array.isArray(root.visuals)) for (const v of root.visuals) { const x = normalizeVisual(v, undefined, n++); if (x) out.push(x); }
  if (Array.isArray(root.pages)) {
    for (const pg of root.pages) {
      if (!isObj(pg)) continue;
      const pageName = str(pg.name ?? pg.displayName);
      for (const v of Array.isArray(pg.visuals) ? pg.visuals : []) { const x = normalizeVisual(v, pageName, n++); if (x) out.push(x); }
    }
  }
  return out;
}

/** Native format from the spec: { tables: [{ name, measures:[{name,dax}], columns }], visuals: [{ page, name, type, measures }] } */
export const nativeJsonImporter: ReportImporter = {
  id: 'native-json',
  label: 'Analyzer JSON',
  description: 'Own format: tables (measures, columns) and visuals. Also accepts "expression" instead of "dax" and nested "pages[].visuals".',
  detect: (src: ImportSource) =>
    isObj(src.json) && Array.isArray((src.json as Obj).tables) && !isObj((src.json as Obj).model) && !Array.isArray((src.json as Obj).sections) ||
    (isObj(src.json) && Array.isArray((src.json as Obj).visuals)),
  parse(src): ImportResult {
    const root = src.json as Obj;
    const model: ReportModel = { name: str(root.name) || undefined, tables: normalizeTables(root.tables), visuals: normalizeVisuals(root) };
    return { model, notes: [`${model.tables.length} tables, ${model.tables.reduce((a, t) => a + t.measures.length, 0)} measures, ${model.visuals.length} visuals`] };
  },
};
