import type { AnalysisResult, MeasureInfo } from '../types/powerbi';
import type { Filters } from '../state/AppState';

const lc = (s: string) => s.toLowerCase();

/** Global search + filters for measures. Visual/page terms match measures used by matching visuals (directly or indirectly). */
export function filterMeasures(a: AnalysisResult, query: string, f: Filters): MeasureInfo[] {
  const q = lc(query.trim());
  const out: MeasureInfo[] = [];
  for (const id of a.measureOrder) {
    const m = a.measures.get(id)!;
    if (f.status !== 'all' && m.status !== f.status) continue;
    if (f.table && m.table !== f.table) continue;
    if (f.usageLevel && a.usage.measures.get(id)?.usageStatus !== f.usageLevel) continue;
    if (f.page || f.visualType) {
      const ok = m.allVisuals.some((vid) => {
        const v = a.visuals.get(vid);
        return !!v && (!f.page || v.page === f.page) && (!f.visualType || v.category === f.visualType);
      });
      if (!ok) continue;
    }
    if (q) {
      const hit =
        lc(m.name).includes(q) || lc(m.table).includes(q) || lc(m.dax).includes(q) ||
        m.allVisuals.some((vid) => {
          const v = a.visuals.get(vid);
          return !!v && (lc(v.name).includes(q) || lc(v.page).includes(q));
        });
      if (!hit) continue;
    }
    out.push(m);
  }
  return out;
}

export interface SearchHits {
  measures: MeasureInfo[];
  tables: string[];
  visuals: { id: string; name: string; page: string }[];
  pages: string[];
}

export function globalSearch(a: AnalysisResult, query: string, limit = 6): SearchHits {
  const q = lc(query.trim());
  if (!q) return { measures: [], tables: [], visuals: [], pages: [] };
  const measures: MeasureInfo[] = [];
  for (const id of a.measureOrder) {
    const m = a.measures.get(id)!;
    if (lc(m.name).includes(q) || lc(m.table).includes(q) || lc(m.dax).includes(q)) {
      measures.push(m);
      if (measures.length >= limit) break;
    }
  }
  return {
    measures,
    tables: [...a.tables.keys()].filter((t) => lc(t).includes(q)).slice(0, limit),
    visuals: [...a.visuals.values()].filter((v) => lc(v.name).includes(q)).slice(0, limit).map((v) => ({ id: v.id, name: v.name, page: v.page })),
    pages: a.pages.filter((p) => lc(p).includes(q)).slice(0, limit),
  };
}
