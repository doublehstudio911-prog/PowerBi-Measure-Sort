import type { AnalysisResult, MeasureInfo } from '../types/powerbi';
import { technicalReasonPath, usageReason } from './reasons';

const shortName = (a: AnalysisResult, id: string) => a.measures.get(id)?.name ?? id;

const STATUS_LABEL = { direct: 'Direct', indirect: 'Indirect', unused: 'Unused' } as const;

function usedBy(a: AnalysisResult, m: MeasureInfo): string[] {
  return [
    ...m.usedByMeasures.map((id) => `Measure: ${shortName(a, id)}`),
    ...m.usedByColumns.map((c) => `Column: ${c}`),
    ...m.directVisuals.map((v) => `Visual: ${a.visuals.get(v)?.page} / ${a.visuals.get(v)?.name}`),
  ];
}

/**
 * The first columns keep their original names (`Status` = technical status) so existing spreadsheets keep working;
 * the usage-metrics columns are appended. Values ending in "Potential"/"Candidate" are estimates from page views.
 */
export const MEASURE_HEADERS = [
  'Measure', 'Table', 'Status', 'DirectUsage', 'IndirectUsage', 'UsedBy', 'DependsOn', 'Circular', 'DAX',
  'TechnicalStatus', 'UsageStatus', 'DirectVisualCount', 'IndirectVisualCount', 'FieldParameterVisualCount',
  'PageViewsPotential', 'DirectPageViewsPotential', 'IndirectPageViewsPotential', 'ParameterCandidateViews',
  'UniqueUsersPotential_NotDeduplicated', 'MatchedPages', 'FieldParameters', 'UsageReason', 'TechnicalReasonPath',
];

export function measureRows(a: AnalysisResult): (string | number)[][] {
  return a.measureOrder.map((id) => {
    const m = a.measures.get(id)!;
    const u = a.usage.measures.get(id);
    return [
      m.name, m.table, STATUS_LABEL[m.status], m.directVisuals.length, m.indirectMeasureUsages,
      usedBy(a, m).join('; '), m.dependsOn.map((d) => shortName(a, d)).join('; '), m.inCycle ? 'yes' : 'no', m.dax,
      m.status.toUpperCase(), u?.usageStatus ?? 'NO_USAGE_DATA', m.directVisuals.length, m.indirectVisuals.length, m.fieldParameterVisuals.length,
      u?.pageViewsPotential ?? 0, u?.directPageViewsPotential ?? 0, u?.indirectPageViewsPotential ?? 0, u?.parameterCandidateViews ?? 0,
      u?.uniqueUsersPotential ?? '', (u?.matchedPages ?? []).join('; '),
      m.fieldParameters.map((f) => a.fieldParameters.get(f)?.name ?? f).join('; '),
      usageReason(m, u), technicalReasonPath(a, m),
    ];
  });
}

/** RFC 4180 CSV; also neutralises spreadsheet formula injection (=, +, -, @ at cell start). */
export function toCsv(a: AnalysisResult): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [MEASURE_HEADERS, ...measureRows(a)].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function toJson(a: AnalysisResult): string {
  const obj = {
    summary: a.summary,
    measures: a.measureOrder.map((id) => {
      const m = a.measures.get(id)!;
      return {
        id, name: m.name, table: m.table, dax: m.dax, status: m.status, isDirect: m.isDirect, isIndirect: m.isIndirect,
        directUsageCount: m.directVisuals.length, indirectUsageCount: m.indirectMeasureUsages,
        dependsOn: m.dependsOn, usedByMeasures: m.usedByMeasures, usedByColumns: m.usedByColumns,
        usedTables: m.usedTables, usedColumns: m.usedColumns,
        directVisuals: m.directVisuals, indirectVisuals: m.indirectVisuals,
        inCycle: m.inCycle, depth: m.depth, reason: m.reason,
        technicalReasonPath: technicalReasonPath(a, m),
        fieldParameters: m.fieldParameters, fieldParameterVisuals: m.fieldParameterVisuals,
        usage: a.usage.measures.get(id),
      };
    }),
    visuals: [...a.visuals.values()],
    tables: [...a.tables.values()].map((t) => ({ name: t.name, measures: t.measureIds, columns: t.columns })),
    fieldParameters: [...a.fieldParameters.values()],
    usageMetrics: {
      loaded: a.usage.hasData,
      note: 'Derived from page views and the technical mapping of pages, visuals and measures – not exact DAX executions or field-parameter selections.',
      totalViews: a.usage.totalViews,
      matchedViews: a.usage.matchedViews,
      unmatchedViews: a.usage.unmatchedViews,
      activeReport: a.usage.activeReport ?? null,
      availableReports: a.usage.availableReports,
      matchedPages: a.usage.pages,
      unmatched: a.usage.unmatched,
      pagesWithoutUsage: a.usage.pagesWithoutUsage,
      distribution: a.usage.distribution,
    },
    circularDependencies: a.cycles,
    longestChains: a.longestChains,
    warnings: a.warnings,
  };
  return JSON.stringify(obj, null, 2);
}

export async function toXlsxBytes(a: AnalysisResult): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const guard = (rows: (string | number)[][]) =>
    rows.map((r) => r.map((c) => (typeof c === 'string' && /^[=+\-@]/.test(c) ? `'${c}` : c)));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guard([MEASURE_HEADERS, ...measureRows(a)])), 'Measures');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(guard([
      ['Measure', 'Table', 'DAX', 'Last modified', 'Referenced by (any measure)'],
      ...a.measureOrder.map((id) => a.measures.get(id)!).filter((m) => m.status === 'unused')
        .map((m) => [m.name, m.table, m.dax, m.lastModified ?? '', m.usedByMeasures.length]),
    ])),
    'Unused',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(guard([
      ['Page', 'Visual', 'Type', 'Measures', 'Columns'],
      ...[...a.visuals.values()].map((v) => [
        v.page, v.name, v.type, v.measures.map((m) => shortName(a, m)).join('; '), v.columns.map((c) => `${c.table}[${c.column}]`).join('; '),
      ]),
    ])),
    'Visuals',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(guard([
      ['Page', 'Views', 'UniqueUsers_NotDeduplicated', 'Rows', 'Dates'],
      ...a.usage.pages.map((p) => [p.page, p.views, p.uniqueUsers ?? '', p.rows, p.dates.join('; ')]),
    ])),
    'MatchedPages',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(guard([
      ['Report', 'Page', 'Views', 'Rows', 'Reason'],
      ...a.usage.unmatched.map((u) => [u.report ?? '', u.page, u.views, u.rows, u.reason]),
    ])),
    'UnmatchedUsage',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(guard([
      ['FieldParameter', 'Used', 'Measures', 'UsedByVisuals'],
      ...[...a.fieldParameters.values()].map((f) => [
        f.name, f.isUsed ? 'yes' : 'no', f.measures.map((m) => shortName(a, m)).join('; '),
        f.usedByVisuals.map((v) => a.visuals.get(v)?.name ?? v).join('; '),
      ]),
    ])),
    'FieldParameters',
  );
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export function downloadBlob(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const el = document.createElement('a');
  el.href = url;
  el.download = name;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
