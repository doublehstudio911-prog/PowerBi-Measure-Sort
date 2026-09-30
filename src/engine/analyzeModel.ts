import type {
  AnalysisResult, ColumnUsage, FieldParameterInfo, MeasureId, MeasureInfo, ReportModel, TableInfo, UsageStatus, VisualInfo,
} from '../types/powerbi';
import { detectCycles, stronglyConnectedComponents } from './circularDependencyDetector';
import { buildDependencyGraph, computeDepths, reachableFrom } from './dependencyResolver';
import { analyzeUsage } from './usageAnalyzer';
import { resolveUsageMetrics } from './usageMetricsResolver';
import { resolveVisuals } from './visualResolver';

/**
 * Single entry point of the analysis engine: ReportModel → AnalysisResult.
 * Pure, synchronous, framework-free.
 */
export function analyzeModel(model: ReportModel): AnalysisResult {
  const graph = buildDependencyGraph(model);
  const warnings = [...graph.warnings];

  const visualBase = resolveVisuals(model, graph.index, warnings);
  const visualMeasures = new Map<string, MeasureId[]>();
  for (const [id, v] of visualBase) visualMeasures.set(id, v.measures);

  // Field parameters: a parameter only matters when a visual uses (a column of) its table
  const parameterByTable = new Map(graph.fieldParameters.map((fp) => [fp.table.toLowerCase(), fp]));
  const visualParameterIds = new Map<string, string[]>();
  const visualParameters = new Map<string, { id: string; measures: MeasureId[] }[]>();
  for (const [vid, v] of visualBase) {
    const used = new Map<string, (typeof graph.fieldParameters)[number]>();
    for (const c of v.columns) {
      const fp = parameterByTable.get(c.table.toLowerCase());
      if (fp) used.set(fp.id, fp);
    }
    if (used.size) {
      visualParameterIds.set(vid, [...used.keys()]);
      visualParameters.set(vid, [...used.values()].map((fp) => ({ id: fp.id, measures: fp.measureIds })));
    }
  }
  const fieldParameters = new Map<string, FieldParameterInfo>();
  for (const fp of graph.fieldParameters) {
    const usedByVisuals = [...visualParameterIds].filter(([, ids]) => ids.includes(fp.id)).map(([vid]) => vid);
    fieldParameters.set(fp.id, {
      id: fp.id, table: fp.table, name: fp.table, dax: fp.dax, measures: fp.measureIds, columns: fp.columns,
      usedByVisuals, isUsed: usedByVisuals.length > 0,
    });
  }

  const usage = analyzeUsage({
    ids: graph.ids,
    forward: graph.forward,
    visualMeasures,
    calculatedColumns: graph.calculatedColumns,
    visualParameters,
  });

  const sccs = stronglyConnectedComponents(graph.ids, graph.forward);
  const cycles = detectCycles(graph.ids, graph.forward, sccs);
  const inCycle = new Set(cycles.flatMap((c) => c.members));
  const { depth, chains } = computeDepths(graph.ids, graph.forward, graph.reverse, sccs);

  const closureOf = (id: MeasureId) => {
    let c = usage.closure.get(id);
    if (!c) usage.closure.set(id, (c = reachableFrom(id, graph.forward)));
    return c;
  };

  const modelMeasureMeta = new Map<string, { lastModified?: string; description?: string }>();
  for (const t of model.tables) for (const m of t.measures ?? []) {
    const key = `${t.name}[${m.name}]`;
    if (!modelMeasureMeta.has(key)) modelMeasureMeta.set(key, { lastModified: m.lastModified, description: m.description });
  }

  const usedByColumns = new Map<MeasureId, string[]>();
  for (const cc of graph.calculatedColumns) {
    for (const m of cc.deps.measureIds) usedByColumns.set(m, [...(usedByColumns.get(m) ?? []), cc.key]);
  }

  const measures = new Map<MeasureId, MeasureInfo>();
  let dependencies = 0;
  for (const id of graph.ids) {
    const im = graph.index.measures.get(id)!;
    const d = graph.deps.get(id)!;
    dependencies += d.measureIds.length;
    const direct = usage.directVisuals.get(id) ?? [];
    const via = [...(usage.indirectVisuals.get(id) ?? [])];
    const fpVisuals = usage.fieldParameterVisuals.get(id) ?? [];
    const isDirect = direct.length > 0;
    const isUsed = usage.used.has(id);
    const status: UsageStatus = isDirect ? 'direct' : isUsed ? 'indirect' : 'unused';
    measures.set(id, {
      id,
      name: im.name,
      table: im.table,
      dax: im.dax,
      ...modelMeasureMeta.get(id),
      dependsOn: d.measureIds,
      usedByMeasures: graph.reverse.get(id) ?? [],
      usedByColumns: usedByColumns.get(id) ?? [],
      usedTables: d.tables,
      usedColumns: d.columns,
      transitiveDependencyCount: closureOf(id).size,
      depth: depth.get(id) ?? 1,
      inCycle: inCycle.has(id),
      status,
      isDirect,
      isIndirect: usage.isIndirect.has(id),
      isUsed,
      directVisuals: direct,
      indirectVisuals: via,
      fieldParameterVisuals: fpVisuals,
      fieldParameters: usage.fieldParameters.get(id) ?? [],
      allVisuals: [...new Set([...direct, ...via, ...fpVisuals])],
      indirectMeasureUsages: usage.indirectMeasureUsages.get(id) ?? 0,
      reason: usage.reasons.get(id) ?? null,
    });
  }

  const visuals = new Map<string, VisualInfo>();
  for (const [id, v] of visualBase) {
    const reach = new Set<MeasureId>();
    const roots = [...v.measures, ...(visualParameters.get(id) ?? []).flatMap((p) => p.measures)];
    for (const m of roots) {
      if (!graph.index.measures.has(m)) continue;
      reach.add(m);
      for (const x of closureOf(m)) reach.add(x);
    }
    visuals.set(id, { ...v, fieldParameters: visualParameterIds.get(id) ?? [], reachableMeasures: [...reach] });
  }

  const tables = new Map<string, TableInfo>();
  for (const t of model.tables) {
    const measureIds = graph.ids.filter((id) => graph.index.measures.get(id)!.table === t.name);
    tables.set(t.name, {
      name: t.name,
      isFieldParameter: parameterByTable.has(t.name.toLowerCase()),
      measureIds,
      columns: t.columns ?? [],
      unusedMeasureCount: measureIds.filter((id) => !usage.used.has(id)).length,
    });
  }

  // column usage (by measures and visuals)
  const cu = new Map<string, ColumnUsage>();
  const touch = (table: string, column: string) => {
    const key = `${table}[${column}]`.toLowerCase();
    let e = cu.get(key);
    if (!e) cu.set(key, (e = { table, column, measures: [], visuals: [] }));
    return e;
  };
  for (const t of model.tables) for (const c of t.columns ?? []) touch(t.name, c.name);
  for (const m of measures.values()) for (const c of m.usedColumns) touch(c.table, c.column).measures.push(m.id);
  for (const v of visuals.values()) for (const c of v.columns) touch(c.table, c.column).visuals.push(v.id);

  const pages = [...new Set(model.visuals.map((v) => v.page))];
  const usedCount = usage.used.size;
  const usageAnalysis = resolveUsageMetrics(
    { metrics: model.usageMetrics, meta: model.usageMeta, reportName: model.name },
    { measures, visuals, pages },
  );
  return {
    measures,
    measureOrder: graph.ids,
    visuals,
    tables,
    pages,
    cycles,
    longestChains: chains,
    columnUsage: [...cu.values()],
    fieldParameters,
    usage: usageAnalysis,
    warnings,
    summary: {
      totalMeasures: graph.ids.length,
      usedMeasures: usedCount,
      directMeasures: usage.directlyUsed.size,
      indirectMeasures: [...usage.used].filter((m) => !usage.directlyUsed.has(m)).length,
      unusedMeasures: graph.ids.length - usedCount,
      dependencies,
      tables: model.tables.length,
      visuals: model.visuals.length,
      pages: pages.length,
      cycles: cycles.length,
      fieldParameters: fieldParameters.size,
      usedFieldParameters: [...fieldParameters.values()].filter((f) => f.isUsed).length,
    },
  };
}

// ───────────────────────── Tree helpers (used by UI + export) ─────────────────────────

export interface TreeNode {
  id: MeasureId;
  children: TreeNode[];
  /** true when this node was already on the current path (cycle) or the depth limit was hit */
  truncated?: 'cycle' | 'depth';
}

function buildTree(root: MeasureId, next: (id: MeasureId) => MeasureId[], maxDepth: number): TreeNode {
  const walk = (id: MeasureId, path: Set<MeasureId>, depth: number): TreeNode => {
    if (path.has(id)) return { id, children: [], truncated: 'cycle' };
    if (depth >= maxDepth) return { id, children: [], truncated: next(id).length ? 'depth' : undefined };
    path.add(id);
    const children = next(id).map((c) => walk(c, path, depth + 1));
    path.delete(id);
    return { id, children };
  };
  return walk(root, new Set(), 0);
}

export const getDependencyTree = (a: AnalysisResult, id: MeasureId, maxDepth = 12) =>
  buildTree(id, (x) => a.measures.get(x)?.dependsOn ?? [], maxDepth);

export const getUsedByTree = (a: AnalysisResult, id: MeasureId, maxDepth = 12) =>
  buildTree(id, (x) => a.measures.get(x)?.usedByMeasures ?? [], maxDepth);
