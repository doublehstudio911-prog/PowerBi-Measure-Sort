import type { MeasureId, UsageReason } from '../types/powerbi';
import type { CalculatedColumnDeps } from './dependencyResolver';
import { reachableFrom } from './dependencyResolver';
import type { Graph } from './circularDependencyDetector';

export interface UsageInput {
  ids: MeasureId[];
  forward: Graph;
  /** visual id → measures used directly */
  visualMeasures: Map<string, MeasureId[]>;
  calculatedColumns: CalculatedColumnDeps[];
}

export interface UsageResult {
  directlyUsed: Set<MeasureId>;
  /** every measure reachable from a visual or a calculated column (= DIRECT ∪ INDIRECT) */
  used: Set<MeasureId>;
  unused: MeasureId[];
  /** direct visual ids per measure */
  directVisuals: Map<MeasureId, string[]>;
  /** visual ids reaching the measure through ≥1 measure hop */
  indirectVisuals: Map<MeasureId, Set<string>>;
  /** number of *used* measures / used calculated columns referencing the measure */
  indirectMeasureUsages: Map<MeasureId, number>;
  isIndirect: Set<MeasureId>;
  reasons: Map<MeasureId, UsageReason>;
  /** closure cache: measure → everything reachable via ≥1 edge */
  closure: Map<MeasureId, Set<MeasureId>>;
}

/**
 * Core usage logic:
 *   USED = DIRECT ∪ (everything reachable from DIRECT)      UNUSED = ALL − USED
 * Implemented as an iterative BFS with a visited set → terminates on circular dependencies.
 * Shortest paths are recorded so each used measure can explain *why* it is used.
 */
export function analyzeUsage(input: UsageInput): UsageResult {
  const { ids, forward, visualMeasures, calculatedColumns } = input;
  const known = new Set(ids);

  const directVisuals = new Map<MeasureId, string[]>();
  for (const [vid, ms] of visualMeasures) {
    for (const m of ms) {
      if (!known.has(m)) continue;
      const list = directVisuals.get(m) ?? [];
      list.push(vid);
      directVisuals.set(m, list);
    }
  }
  const directlyUsed = new Set(directVisuals.keys());

  const used = new Set<MeasureId>();
  const parent = new Map<MeasureId, MeasureId | null>();
  const rootOf = new Map<MeasureId, UsageReason['root']>();

  const bfs = (starts: [MeasureId, UsageReason['root']][]) => {
    const queue: MeasureId[] = [];
    for (const [m, root] of starts) {
      if (used.has(m) || !known.has(m)) continue;
      used.add(m);
      parent.set(m, null);
      rootOf.set(m, root);
      queue.push(m);
    }
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h];
      for (const w of forward.get(v) ?? []) {
        if (used.has(w)) continue;
        used.add(w);
        parent.set(w, v);
        queue.push(w);
      }
    }
  };

  // 1) visuals first so their paths win; 2) calculated columns keep otherwise-orphaned measures alive
  bfs([...directVisuals].map(([m, vs]) => [m, { kind: 'visual', visualId: vs[0] }]));
  const columnRoots: [MeasureId, UsageReason['root']][] = [];
  for (const cc of calculatedColumns) for (const m of cc.deps.measureIds) columnRoots.push([m, { kind: 'column', column: cc.key }]);
  bfs(columnRoots);

  const reasons = new Map<MeasureId, UsageReason>();
  for (const m of used) {
    const chain: MeasureId[] = [];
    let cur: MeasureId | null = m;
    let guard = 0;
    while (cur !== null && guard++ <= ids.length) {
      chain.push(cur);
      cur = parent.get(cur) ?? null;
    }
    chain.reverse();
    reasons.set(m, { root: rootOf.get(chain[0])!, chain });
  }

  // Closures (cached) – used for visual attribution and counts
  const closure = new Map<MeasureId, Set<MeasureId>>();
  const closureOf = (m: MeasureId) => {
    let c = closure.get(m);
    if (!c) {
      c = reachableFrom(m, forward);
      closure.set(m, c);
    }
    return c;
  };

  const indirectVisuals = new Map<MeasureId, Set<string>>();
  for (const [d, vs] of directVisuals) {
    for (const x of closureOf(d)) {
      let s = indirectVisuals.get(x);
      if (!s) indirectVisuals.set(x, (s = new Set()));
      for (const v of vs) s.add(v);
    }
  }

  const indirectMeasureUsages = new Map<MeasureId, number>();
  const isIndirect = new Set<MeasureId>();
  for (const u of used) {
    for (const w of forward.get(u) ?? []) {
      indirectMeasureUsages.set(w, (indirectMeasureUsages.get(w) ?? 0) + 1);
      isIndirect.add(w);
    }
  }
  for (const cc of calculatedColumns) {
    for (const m of cc.deps.measureIds) {
      if (!known.has(m)) continue;
      indirectMeasureUsages.set(m, (indirectMeasureUsages.get(m) ?? 0) + 1);
      isIndirect.add(m);
    }
  }

  return {
    directlyUsed,
    used,
    unused: ids.filter((id) => !used.has(id)),
    directVisuals,
    indirectVisuals,
    indirectMeasureUsages,
    isIndirect,
    reasons,
    closure,
  };
}
