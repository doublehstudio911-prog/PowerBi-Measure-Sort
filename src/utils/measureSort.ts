import type { AnalysisResult, MeasureInfo, UsageLevel } from '../types/powerbi';

export type SortKey =
  | 'name' | 'table' | 'status' | 'usage' | 'direct' | 'indirect' | 'fp' | 'pot' | 'dpot' | 'ipot' | 'ppot' | 'refs';
export interface SortState { key: SortKey; dir: 1 | -1 }

const LEVEL_RANK: Record<UsageLevel, number> = { HIGH: 4, MEDIUM: 3, LOW: 2, NO_OBSERVED_USAGE: 1, NO_USAGE_DATA: 0 };
const STATUS_RANK = { direct: 2, indirect: 1, unused: 0 } as const;

export function sortValue(a: AnalysisResult, m: MeasureInfo, key: SortKey): string | number {
  const u = a.usage.measures.get(m.id);
  switch (key) {
    case 'name': return m.name.toLowerCase();
    case 'table': return m.table.toLowerCase();
    case 'status': return STATUS_RANK[m.status];
    case 'usage': return LEVEL_RANK[u?.usageStatus ?? 'NO_USAGE_DATA'];
    case 'direct': return m.directVisuals.length;
    case 'indirect': return m.indirectVisuals.length;
    case 'fp': return m.fieldParameterVisuals.length;
    case 'pot': return u?.pageViewsPotential ?? 0;
    case 'dpot': return u?.directPageViewsPotential ?? 0;
    case 'ipot': return u?.indirectPageViewsPotential ?? 0;
    case 'ppot': return u?.parameterCandidateViews ?? 0;
    case 'refs': return m.usedByMeasures.length;
  }
}

/** Stable, deterministic sort (ties → measure name). Does not mutate the input. */
export function sortMeasures(a: AnalysisResult, list: MeasureInfo[], sort: SortState): MeasureInfo[] {
  return [...list].sort((x, y) => {
    const vx = sortValue(a, x, sort.key);
    const vy = sortValue(a, y, sort.key);
    const c = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : String(vx).localeCompare(String(vy));
    return c * sort.dir || x.name.localeCompare(y.name);
  });
}

export const SORT_PRESETS: { id: string; label: string; sort: SortState }[] = [
  { id: 'name', label: 'Name (A–Z)', sort: { key: 'name', dir: 1 } },
  { id: 'highest', label: 'Highest potential usage', sort: { key: 'pot', dir: -1 } },
  { id: 'lowest', label: 'Lowest potential usage', sort: { key: 'pot', dir: 1 } },
  { id: 'direct', label: 'Most used direct measures', sort: { key: 'dpot', dir: -1 } },
  { id: 'param', label: 'Most used parameter candidates', sort: { key: 'ppot', dir: -1 } },
];
