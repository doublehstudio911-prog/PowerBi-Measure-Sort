import type { AnalysisResult, MeasureId, UsageStatus } from '../../types/powerbi';

export type GKind = 'measure' | 'visual' | 'page' | 'more';
export interface GNode {
  id: string;
  kind: GKind;
  label: string;
  sub?: string;
  status?: UsageStatus;
  inCycle?: boolean;
  measureId?: MeasureId;
}
export interface GEdge { id: string; source: string; target: string }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; truncated: boolean }

export type Direction = 'both' | 'usedBy' | 'dependsOn';

export const mId = (id: MeasureId) => `m:${id}`;
export const vId = (id: string) => `v:${id}`;
export const pId = (p: string) => `p:${p}`;

class Builder {
  nodes = new Map<string, GNode>();
  edges = new Map<string, GEdge>();
  constructor(private a: AnalysisResult) {}
  measure(id: MeasureId) {
    const m = this.a.measures.get(id)!;
    this.nodes.set(mId(id), { id: mId(id), kind: 'measure', label: m.name, sub: m.table, status: m.status, inCycle: m.inCycle, measureId: id });
  }
  visual(id: string) {
    const v = this.a.visuals.get(id)!;
    this.nodes.set(vId(id), { id: vId(id), kind: 'visual', label: v.name, sub: v.type });
    if (!this.nodes.has(pId(v.page))) this.nodes.set(pId(v.page), { id: pId(v.page), kind: 'page', label: v.page, sub: 'Page' });
    this.edge(pId(v.page), vId(id));
  }
  edge(s: string, t: string) {
    this.edges.set(`${s}>${t}`, { id: `${s}>${t}`, source: s, target: t });
  }
}

/**
 * Sub-graph around one measure. Edges point in the direction of "uses":
 * Page → Visual → Measure → dependency.
 */
export function buildFocusGraph(
  a: AnalysisResult,
  focus: MeasureId,
  opts: { direction: Direction; showVisuals: boolean; maxNodes?: number; maxVisuals?: number },
): GraphData {
  const maxNodes = opts.maxNodes ?? 300;
  const maxVisuals = opts.maxVisuals ?? 12;
  const b = new Builder(a);
  let truncated = false;
  if (!a.measures.has(focus)) return { nodes: [], edges: [], truncated: false };
  b.measure(focus);

  const walk = (next: (id: MeasureId) => MeasureId[], asEdge: (from: MeasureId, to: MeasureId) => [MeasureId, MeasureId]) => {
    const seen = new Set<MeasureId>([focus]);
    const queue = [focus];
    for (let h = 0; h < queue.length; h++) {
      for (const n of next(queue[h])) {
        if (b.nodes.size >= maxNodes && !seen.has(n)) { truncated = true; continue; }
        const [s, t] = asEdge(queue[h], n);
        if (!seen.has(n)) { seen.add(n); queue.push(n); b.measure(n); }
        b.edge(mId(s), mId(t));
      }
    }
    return seen;
  };

  let ancestors = new Set<MeasureId>([focus]);
  if (opts.direction !== 'usedBy') walk((x) => a.measures.get(x)?.dependsOn ?? [], (from, to) => [from, to]);
  if (opts.direction !== 'dependsOn') ancestors = walk((x) => a.measures.get(x)?.usedByMeasures ?? [], (from, to) => [to, from]);

  if (opts.showVisuals && opts.direction !== 'dependsOn') {
    const vis: { v: string; m: MeasureId }[] = [];
    for (const m of ancestors) for (const v of a.measures.get(m)!.directVisuals) vis.push({ v, m });
    const distinct = [...new Set(vis.map((x) => x.v))];
    const shown = new Set(distinct.slice(0, maxVisuals));
    for (const { v, m } of vis) {
      if (!shown.has(v)) continue;
      b.visual(v);
      b.edge(vId(v), mId(m));
    }
    if (distinct.length > shown.size) {
      b.nodes.set('more', { id: 'more', kind: 'more', label: `+${distinct.length - shown.size} more visuals` });
      truncated = true;
    }
  }
  return { nodes: [...b.nodes.values()], edges: [...b.edges.values()], truncated };
}

/** Whole-model graph (rendered only on request). */
export function buildFullGraph(
  a: AnalysisResult,
  opts: { table?: string; status?: 'all' | 'used' | 'unused'; showVisuals: boolean },
): GraphData {
  const b = new Builder(a);
  const keep = new Set<MeasureId>();
  for (const id of a.measureOrder) {
    const m = a.measures.get(id)!;
    if (opts.table && m.table !== opts.table) continue;
    if (opts.status === 'used' && !m.isUsed) continue;
    if (opts.status === 'unused' && m.isUsed) continue;
    keep.add(id);
    b.measure(id);
  }
  for (const id of keep) for (const d of a.measures.get(id)!.dependsOn) if (keep.has(d)) b.edge(mId(id), mId(d));
  if (opts.showVisuals) {
    for (const v of a.visuals.values()) {
      const targets = v.measures.filter((m) => keep.has(m));
      if (!targets.length) continue;
      b.visual(v.id);
      targets.forEach((m) => b.edge(vId(v.id), mId(m)));
    }
  }
  return { nodes: [...b.nodes.values()], edges: [...b.edges.values()], truncated: false };
}

/** All nodes reachable up-/downstream of `node` inside the displayed graph. */
export function relatedNodes(g: GraphData, node: string): { up: Set<string>; down: Set<string> } {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of g.edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    inn.set(e.target, [...(inn.get(e.target) ?? []), e.source]);
  }
  const bfs = (adj: Map<string, string[]>) => {
    const seen = new Set<string>();
    const q = [node];
    for (let h = 0; h < q.length; h++) for (const n of adj.get(q[h]) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return seen;
  };
  return { up: bfs(inn), down: bfs(out) };
}

/** Node/edge ids of the "why is it used" path: Page → Visual → chain… */
export function reasonPathIds(a: AnalysisResult, id: MeasureId): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const r = a.measures.get(id)?.reason;
  if (!r) return { nodes, edges };
  let prev: string | null = null;
  if (r.root.kind === 'visual') {
    const v = a.visuals.get(r.root.visualId);
    if (v) {
      nodes.add(pId(v.page)); nodes.add(vId(v.id));
      edges.add(`${pId(v.page)}>${vId(v.id)}`);
      prev = vId(v.id);
    }
  }
  for (const m of r.chain) {
    nodes.add(mId(m));
    if (prev) edges.add(`${prev}>${mId(m)}`);
    prev = mId(m);
  }
  return { nodes, edges };
}
