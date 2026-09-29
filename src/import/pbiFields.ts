/**
 * Shared helper for report metadata: walks any JSON subtree and collects every
 * Measure / Column field reference (`{ Measure: { Expression: { SourceRef: { Entity }}, Property }}`).
 * Walking the *whole* visual (query, sort, filters, conditional-formatting rules) is deliberate:
 * a measure used only for a data-driven colour or a visual filter is still in use.
 */
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

export interface FieldRefs {
  measures: string[];
  columns: string[];
}

export function collectFieldRefs(root: unknown, aliases: Map<string, string> = new Map()): FieldRefs {
  const measures = new Set<string>();
  const columns = new Set<string>();

  const asRef = (f: Obj): string | null => {
    if (typeof f.Property !== 'string') return null;
    const src = f.Expression?.SourceRef;
    const table = src?.Entity ?? (src?.Source ? aliases.get(src.Source) ?? src.Source : '');
    return table ? `${table}[${f.Property}]` : `[${f.Property}]`;
  };

  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isObj(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'Measure' || k === 'Column') && isObj(v)) {
        const r = asRef(v);
        if (r) (k === 'Measure' ? measures : columns).add(r);
      }
      walk(v);
    }
  };
  walk(root);
  return { measures: [...measures], columns: [...columns] };
}
