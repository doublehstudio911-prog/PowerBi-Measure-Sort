import dagre from '@dagrejs/dagre';
import type { GKind, GraphData } from './buildGraph';

export const NODE_SIZE: Record<GKind, { w: number; h: number }> = {
  measure: { w: 210, h: 58 },
  visual: { w: 210, h: 58 },
  page: { w: 190, h: 40 },
  param: { w: 210, h: 58 },
  more: { w: 190, h: 36 },
};

/** Layered top-down layout. dagre copes with cycles (it reverses back-edges internally). */
export function layoutGraph(g: GraphData, direction: 'TB' | 'LR' = 'TB'): Map<string, { x: number; y: number }> {
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: direction, nodesep: 28, ranksep: 64, marginx: 20, marginy: 20 });
  dg.setDefaultEdgeLabel(() => ({}));
  for (const n of g.nodes) dg.setNode(n.id, { width: NODE_SIZE[n.kind].w, height: NODE_SIZE[n.kind].h });
  for (const e of g.edges) dg.setEdge(e.source, e.target);
  dagre.layout(dg);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of g.nodes) {
    const p = dg.node(n.id);
    out.set(n.id, { x: p.x - NODE_SIZE[n.kind].w / 2, y: p.y - NODE_SIZE[n.kind].h / 2 });
  }
  return out;
}
