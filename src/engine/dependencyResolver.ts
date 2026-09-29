import type {
  AnalysisWarning, Column, ColumnRef, DependencyChain, MeasureId, ReportModel,
} from '../types/powerbi';
import { parseDax, type DaxRef } from './daxParser';
import type { Graph } from './circularDependencyDetector';

export const measureId = (table: string, name: string): MeasureId => `${table}[${name}]`;
const lc = (s: string) => s.trim().toLowerCase();

// ───────────────────────── Model index ─────────────────────────

export interface IndexedMeasure {
  id: MeasureId;
  table: string;
  name: string;
  dax: string;
}

export interface ModelIndex {
  measures: Map<MeasureId, IndexedMeasure>;
  /** lower-case measure name → ids (usually exactly one; Power BI enforces unique names per model) */
  byName: Map<string, MeasureId[]>;
  /** "table\0name" (lower-case) → id, for case-insensitive qualified lookups */
  byQualified: Map<string, MeasureId>;
  /** lower-case table name → canonical name */
  tables: Map<string, string>;
  /** lower-case table → lower-case column names */
  columns: Map<string, Set<string>>;
  warnings: AnalysisWarning[];
}

export function buildModelIndex(model: ReportModel): ModelIndex {
  const idx: ModelIndex = { measures: new Map(), byName: new Map(), byQualified: new Map(), tables: new Map(), columns: new Map(), warnings: [] };
  for (const t of model.tables) {
    idx.tables.set(lc(t.name), t.name);
    const cols = idx.columns.get(lc(t.name)) ?? new Set<string>();
    for (const c of t.columns ?? []) cols.add(lc(c.name));
    idx.columns.set(lc(t.name), cols);
    for (const m of t.measures ?? []) {
      const id = measureId(t.name, m.name);
      if (idx.measures.has(id)) {
        idx.warnings.push({ kind: 'duplicate-measure', message: `Duplicate measure ${id} – only the first definition is analysed.` });
        continue;
      }
      idx.measures.set(id, { id, table: t.name, name: m.name, dax: m.dax ?? '' });
      const list = idx.byName.get(lc(m.name)) ?? [];
      list.push(id);
      idx.byName.set(lc(m.name), list);
      idx.byQualified.set(`${lc(t.name)}\0${lc(m.name)}`, id);
    }
  }
  return idx;
}

// ───────────────────────── Reference resolution ─────────────────────────

export type ResolvedRef =
  | { kind: 'measure'; id: MeasureId; ambiguous?: MeasureId[] }
  | { kind: 'column'; table?: string; column: string; known: boolean };

/**
 * Decides whether `[Name]` / `Table[Name]` is a measure or a column.
 *
 * Rules (conservative – when in doubt prefer "measure", because a false
 * "unused" verdict is far more harmful than a false "used" one):
 *  - `Table[Name]`: measure if the table has such a measure, else column if the table has such a column,
 *     else measure if a measure with this name exists anywhere, else column.
 *  - `[Name]`: measure if one exists (preferring the owner table), else column of the owner table.
 *  - `Var[Col]` where Var is a VAR (and not a table): always a column.
 */
export function resolveRef(idx: ModelIndex, ref: DaxRef, ownerTable?: string, variables?: Set<string>): ResolvedRef {
  const name = ref.name;
  const candidates = idx.byName.get(lc(name)) ?? [];

  if (ref.table !== undefined) {
    // A VAR declared in this expression shadows any table of the same name
    if (variables?.has(lc(ref.table))) return { kind: 'column', table: ref.table, column: name, known: false };
    const tCanon = idx.tables.get(lc(ref.table));
    if (!tCanon) {
      if (candidates.length) return { kind: 'measure', id: candidates[0], ambiguous: candidates.length > 1 ? candidates : undefined };
      return { kind: 'column', table: ref.table, column: name, known: false };
    }
    const own = idx.byQualified.get(`${lc(tCanon)}\0${lc(name)}`);
    if (own) return { kind: 'measure', id: own };
    if (idx.columns.get(lc(tCanon))?.has(lc(name))) return { kind: 'column', table: tCanon, column: name, known: true };
    if (candidates.length) return { kind: 'measure', id: candidates[0], ambiguous: candidates.length > 1 ? candidates : undefined };
    return { kind: 'column', table: tCanon, column: name, known: false };
  }

  if (candidates.length) {
    const inOwner = ownerTable ? candidates.find((c) => lc(idx.measures.get(c)!.table) === lc(ownerTable)) : undefined;
    const pick = inOwner ?? candidates[0];
    return { kind: 'measure', id: pick, ambiguous: !inOwner && candidates.length > 1 ? candidates : undefined };
  }
  const owner = ownerTable ? idx.tables.get(lc(ownerTable)) : undefined;
  const known = !!(owner && idx.columns.get(lc(owner))?.has(lc(name)));
  return { kind: 'column', table: owner ?? ownerTable, column: name, known };
}

// ───────────────────────── Expression analysis ─────────────────────────

export interface ExpressionDeps {
  measureIds: MeasureId[];
  columns: ColumnRef[];
  tables: string[];
  warnings: AnalysisWarning[];
}

export function analyzeExpression(idx: ModelIndex, dax: string, ownerTable: string | undefined, selfName?: string): ExpressionDeps {
  const parsed = parseDax(dax, { selfName });
  const variables = new Set(parsed.variables.map(lc));
  const measureIds = new Set<MeasureId>();
  const columns = new Map<string, ColumnRef>();
  const tables = new Set<string>();
  const warnings: AnalysisWarning[] = [];

  for (const ref of parsed.refs) {
    const r = resolveRef(idx, ref, ownerTable, variables);
    if (r.kind === 'measure') {
      measureIds.add(r.id);
      if (r.ambiguous) {
        warnings.push({ kind: 'ambiguous-measure', message: `[${ref.name}] is ambiguous (${r.ambiguous.join(', ')}); assumed ${r.id}.` });
      }
      continue;
    }
    if (r.table) {
      const canon = idx.tables.get(lc(r.table));
      if (canon) {
        tables.add(canon);
        columns.set(`${canon}[${r.column}]`.toLowerCase(), { table: canon, column: r.column });
      }
    }
  }
  for (const ident of parsed.identifiers) {
    const canon = idx.tables.get(lc(ident));
    if (canon && !variables.has(lc(ident))) tables.add(canon);
  }
  return { measureIds: [...measureIds], columns: [...columns.values()], tables: [...tables], warnings };
}

// ───────────────────────── Dependency graph ─────────────────────────

export interface CalculatedColumnDeps {
  key: string; // "Table[Column]"
  table: string;
  column: Column;
  deps: ExpressionDeps;
}

export interface DependencyGraph {
  index: ModelIndex;
  /** Stable order: as in the model */
  ids: MeasureId[];
  deps: Map<MeasureId, ExpressionDeps>;
  /** measure → measures it references */
  forward: Graph;
  /** measure → measures referencing it */
  reverse: Graph;
  calculatedColumns: CalculatedColumnDeps[];
  warnings: AnalysisWarning[];
}

export function buildDependencyGraph(model: ReportModel): DependencyGraph {
  const index = buildModelIndex(model);
  const ids = [...index.measures.keys()];
  const deps = new Map<MeasureId, ExpressionDeps>();
  const forward: Graph = new Map();
  const reverse: Graph = new Map(ids.map((id) => [id, []]));
  const warnings: AnalysisWarning[] = [...index.warnings];

  for (const id of ids) {
    const m = index.measures.get(id)!;
    const d = analyzeExpression(index, m.dax, m.table, m.name);
    deps.set(id, d);
    forward.set(id, d.measureIds);
    warnings.push(...d.warnings.map((w) => ({ ...w, message: `${id}: ${w.message}` })));
    for (const dep of d.measureIds) reverse.get(dep)!.push(id);
  }

  const calculatedColumns: CalculatedColumnDeps[] = [];
  for (const t of model.tables) {
    for (const c of t.columns ?? []) {
      if (!c.calculated || !c.dax) continue;
      calculatedColumns.push({ key: `${t.name}[${c.name}]`, table: t.name, column: c, deps: analyzeExpression(index, c.dax, t.name, c.name) });
    }
  }
  return { index, ids, deps, forward, reverse, calculatedColumns, warnings };
}

// ───────────────────────── Traversal helpers ─────────────────────────

/** All nodes reachable from `start` via ≥1 edge. Cycle-safe (visited set). `start` is included only if it lies on a cycle. */
export function reachableFrom(start: MeasureId, graph: Graph): Set<MeasureId> {
  const seen = new Set<MeasureId>();
  const queue: MeasureId[] = [...(graph.get(start) ?? [])];
  for (const q of queue) seen.add(q);
  for (let h = 0; h < queue.length; h++) {
    for (const w of graph.get(queue[h]) ?? []) {
      if (!seen.has(w)) {
        seen.add(w);
        queue.push(w);
      }
    }
  }
  return seen;
}

export const getTransitiveDependencies = (id: MeasureId, g: DependencyGraph) => reachableFrom(id, g.forward);
export const getTransitiveDependents = (id: MeasureId, g: DependencyGraph) => reachableFrom(id, g.reverse);

/**
 * Longest dependency chains. Nodes on circular components terminate a chain
 * (depth 1) so the result stays well-defined.
 */
export function computeDepths(
  ids: MeasureId[],
  forward: Graph,
  reverse: Graph,
  sccs: MeasureId[][],
  limit = 10,
): { depth: Map<MeasureId, number>; chains: DependencyChain[] } {
  const depth = new Map<MeasureId, number>();
  const next = new Map<MeasureId, MeasureId | null>();
  const cyclic = new Set<MeasureId>();
  for (const comp of sccs) {
    const isCyclic = comp.length > 1 || (forward.get(comp[0]) ?? []).includes(comp[0]);
    if (isCyclic) comp.forEach((c) => cyclic.add(c));
  }
  // sccs are dependencies-first, so every dependency already has its depth
  for (const comp of sccs) {
    for (const v of comp) {
      if (cyclic.has(v)) {
        depth.set(v, 1);
        next.set(v, null);
        continue;
      }
      let best = 0;
      let bestNext: MeasureId | null = null;
      for (const w of forward.get(v) ?? []) {
        const d = depth.get(w) ?? 1;
        if (d > best) {
          best = d;
          bestNext = w;
        }
      }
      depth.set(v, 1 + best);
      next.set(v, bestNext);
    }
  }

  const tops = ids.filter((id) => (reverse.get(id) ?? []).length === 0 && (depth.get(id) ?? 1) > 1);
  tops.sort((a, b) => (depth.get(b)! - depth.get(a)!) || a.localeCompare(b));
  const chains: DependencyChain[] = tops.slice(0, limit).map((top) => {
    const path: MeasureId[] = [];
    let cur: MeasureId | null = top;
    while (cur && path.length <= ids.length) {
      path.push(cur);
      cur = next.get(cur) ?? null;
    }
    return { path, endsInCycle: cyclic.has(path[path.length - 1]) };
  });
  return { depth, chains };
}

