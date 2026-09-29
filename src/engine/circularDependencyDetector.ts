import type { CycleInfo, MeasureId } from '../types/powerbi';

export type Graph = Map<MeasureId, MeasureId[]>;

/**
 * Iterative Tarjan SCC (no recursion → no stack overflow on very deep models).
 * Components are returned in reverse topological order: a component is emitted only
 * after every component reachable from it, i.e. *dependencies come first*.
 */
export function stronglyConnectedComponents(nodes: MeasureId[], adj: Graph): MeasureId[][] {
  const index = new Map<MeasureId, number>();
  const low = new Map<MeasureId, number>();
  const onStack = new Set<MeasureId>();
  const stack: MeasureId[] = [];
  const result: MeasureId[][] = [];
  let counter = 0;

  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: { v: MeasureId; i: number }[] = [{ v: root, i: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (work.length) {
      const frame = work[work.length - 1];
      const succ = adj.get(frame.v) ?? [];
      if (frame.i < succ.length) {
        const w = succ[frame.i++];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        }
      } else {
        work.pop();
        const v = frame.v;
        if (low.get(v) === index.get(v)) {
          const comp: MeasureId[] = [];
          let w: MeasureId;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== v);
          result.push(comp);
        }
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
        }
      }
    }
  }
  return result;
}

/** Shortest cycle through `start`, staying inside `members`. Returns [start, …, last] where last → start. */
function findCyclePath(start: MeasureId, members: Set<MeasureId>, adj: Graph): MeasureId[] {
  const parent = new Map<MeasureId, MeasureId | null>();
  const queue: MeasureId[] = [];
  for (const w of adj.get(start) ?? []) {
    if (!members.has(w)) continue;
    if (w === start) return [start];
    if (!parent.has(w)) {
      parent.set(w, null);
      queue.push(w);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const v = queue[h];
    for (const w of adj.get(v) ?? []) {
      if (!members.has(w)) continue;
      if (w === start) {
        const path: MeasureId[] = [];
        let cur: MeasureId | null = v;
        while (cur !== null) {
          path.push(cur);
          cur = parent.get(cur) ?? null;
        }
        return [start, ...path.reverse()];
      }
      if (!parent.has(w)) {
        parent.set(w, v);
        queue.push(w);
      }
    }
  }
  return [start];
}

/** One CycleInfo per circular strongly-connected component (including self references). */
export function detectCycles(nodes: MeasureId[], adj: Graph, sccs = stronglyConnectedComponents(nodes, adj)): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  for (const comp of sccs) {
    const selfLoop = comp.length === 1 && (adj.get(comp[0]) ?? []).includes(comp[0]);
    if (comp.length < 2 && !selfLoop) continue;
    const members = new Set(comp);
    const ordered = [...comp].sort();
    cycles.push({ path: findCyclePath(ordered[0], members, adj), members: ordered });
  }
  return cycles.sort((a, b) => a.path[0].localeCompare(b.path[0]));
}

export function formatCycle(c: CycleInfo, label: (id: MeasureId) => string = (x) => x): string {
  return [...c.path, c.path[0]].map(label).join(' → ');
}
