import type { AnalysisWarning, ColumnRef, MeasureId, ReportModel, VisualInfo } from '../types/powerbi';
import { parseDax, type DaxRef } from './daxParser';
import { resolveRef, type ModelIndex } from './dependencyResolver';
import { categorizeVisualType } from './visualCategory';

const lc = (s: string) => s.trim().toLowerCase();

/**
 * Parses a field reference as found in visual metadata:
 * "[Revenue]", "Sales[Revenue]", "'My Table'[Revenue]", "Sales.Revenue", "Sum(Sales.Amount)", "Revenue".
 */
export function parseFieldRef(raw: string, idx?: ModelIndex): DaxRef | null {
  let s = (raw ?? '').trim();
  if (!s) return null;
  const parsed = parseDax(s);
  if (parsed.refs.length === 1) return parsed.refs[0];
  // Aggregation wrapper: Sum(Sales.Amount)
  const agg = /^\w+\((.*)\)$/.exec(s);
  if (agg) s = agg[1].trim();
  // Dotted form – find a split where the left part is a known table
  if (s.includes('.')) {
    for (let i = s.indexOf('.'); i !== -1; i = s.indexOf('.', i + 1)) {
      const table = s.slice(0, i);
      if (idx?.tables.has(lc(table))) return { table, name: s.slice(i + 1) };
    }
    const first = s.indexOf('.');
    if (!idx) return { table: s.slice(0, first), name: s.slice(first + 1) };
  }
  return { name: s };
}

export function resolveVisuals(
  model: ReportModel,
  idx: ModelIndex,
  warnings: AnalysisWarning[],
): Map<string, Omit<VisualInfo, 'reachableMeasures' | 'fieldParameters'>> {
  const out = new Map<string, Omit<VisualInfo, 'reachableMeasures' | 'fieldParameters'>>();
  model.visuals.forEach((v, n) => {
    const id = v.id || `${v.page}/${v.name}#${n}`;
    const measures = new Set<MeasureId>();
    const columns = new Map<string, ColumnRef>();
    const unresolved: string[] = [];

    const handle = (raw: string, expected: 'measure' | 'column' | 'any') => {
      const ref = parseFieldRef(raw, idx);
      if (!ref) return;
      const r = resolveRef(idx, ref);
      if (r.kind === 'measure') {
        measures.add(r.id);
        return;
      }
      if (expected === 'measure' && !r.known) {
        unresolved.push(raw);
        warnings.push({ kind: 'unresolved-visual-field', message: `Visual "${v.name}" (${v.page}): measure ${raw} not found in model.` });
        return;
      }
      const table = r.table ? idx.tables.get(lc(r.table)) ?? r.table : '';
      columns.set(`${table}[${r.column}]`.toLowerCase(), { table, column: r.column });
    };

    (v.measures ?? []).forEach((f) => handle(f, 'measure'));
    (v.columns ?? []).forEach((f) => handle(f, 'column'));
    (v.fields ?? []).forEach((f) => handle(f, 'any'));

    out.set(id, {
      id,
      page: v.page,
      pageId: v.pageId,
      name: v.name,
      type: v.type,
      category: categorizeVisualType(v.type),
      measures: [...measures],
      columns: [...columns.values()],
      unresolved,
    });
  });
  return out;
}
