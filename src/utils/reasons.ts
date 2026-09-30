import type { AnalysisResult, MeasureInfo, MeasureUsageMetrics, UsageLevel } from '../types/powerbi';

/** "Page › Visual › Field Parameter › Measure › Measure" – the technical explanation why a measure is used. */
export function technicalReasonPath(a: AnalysisResult, m: MeasureInfo): string {
  const r = m.reason;
  if (!r) return '';
  const parts: string[] = [];
  if (r.root.kind === 'visual') {
    const v = a.visuals.get(r.root.visualId);
    if (v) parts.push(`Page: ${v.page}`, `Visual: ${v.name}`);
    if (r.root.fieldParameter) parts.push(`Field Parameter: ${a.fieldParameters.get(r.root.fieldParameter)?.name ?? r.root.fieldParameter}`);
  } else {
    parts.push(`Calculated column: ${r.root.column}`);
  }
  for (const id of r.chain) parts.push(a.measures.get(id)?.name ?? id);
  return parts.join(' › ');
}

export const USAGE_LEVEL_LABEL: Record<UsageLevel, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NO_OBSERVED_USAGE: 'No observed usage',
  NO_USAGE_DATA: 'No usage data',
};

export const USAGE_LEVEL_HELP: Record<UsageLevel, string> = {
  HIGH: 'Top third of all measures with page views (relative mid-rank percentile of potential page views).',
  MEDIUM: 'Middle third of all measures with page views. Also used when all measures have the same value.',
  LOW: 'Bottom third of all measures with page views.',
  NO_OBSERVED_USAGE: 'Usage metrics are loaded, but the pages this measure is reachable on have no views (or no matching usage rows).',
  NO_USAGE_DATA: 'No usage metrics imported yet – only the technical status is known.',
};

export const USAGE_DISCLAIMER =
  'Die Nutzungswerte werden aus Seitenaufrufen und der technischen Zuordnung von Seiten, Visuals und Measures abgeleitet. ' +
  'Sie stellen keine exakte Anzahl tatsächlicher DAX-Ausführungen oder Field-Parameter-Auswahlen dar.';

export const USAGE_LEVEL_TOOLTIP =
  'HIGH / MEDIUM / LOW are relative: measures with potential page views are ranked by mid-rank percentile ' +
  '(top third = HIGH, middle third = MEDIUM, bottom third = LOW; ties share a rank, all-equal values = MEDIUM). ' +
  'NO_OBSERVED_USAGE: usage data loaded but no views on the reachable pages. NO_USAGE_DATA: no usage metrics imported.';

const n = (v: number) => v.toLocaleString('en-US');

/** One-line explanation of the usage classification of a measure. */
export function usageReason(m: MeasureInfo, u: MeasureUsageMetrics | undefined): string {
  if (!u) return '';
  switch (u.usageStatus) {
    case 'NO_USAGE_DATA':
      return 'No usage metrics imported.';
    case 'NO_OBSERVED_USAGE':
      return m.isUsed
        ? 'Technically used, but no page views observed on the pages where it is reachable.'
        : 'Technically unused and no page views observed.';
    default:
      return `${n(u.pageViewsPotential)} potential page views on ${u.matchedPages.length} page(s): ${u.matchedPages.join(', ')}.`;
  }
}
