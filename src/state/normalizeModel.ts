import type { Column, Measure, ReportModel, Table, Visual } from '../types/powerbi';
import { normalizeUsageMeta, normalizeUsageMetrics } from '../import/usageMetrics';

const asArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/**
 * Brings persisted / imported models of any earlier version into the current shape:
 * missing arrays get defaults, new optional fields (usage data, calculated-table DAX, page ids) may be absent.
 * Never mutates the input.
 */
export function normalizeModel(raw: unknown): ReportModel {
  const o: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  const tables = asArray<Partial<Table>>(o.tables).filter((t) => typeof t?.name === 'string').map((t): Table => ({
    name: t.name as string,
    measures: asArray<Measure>(t.measures),
    columns: asArray<Column>(t.columns),
    ...(typeof t.dax === 'string' && t.dax ? { dax: t.dax } : {}),
  }));
  const visuals = asArray<Partial<Visual>>(o.visuals).map((v, i): Visual => ({
    id: typeof v.id === 'string' && v.id ? v.id : `${v.page ?? 'Page'}/${v.name ?? 'Visual'}#${i}`,
    page: typeof v.page === 'string' ? v.page : 'Page',
    ...(typeof v.pageId === 'string' && v.pageId ? { pageId: v.pageId } : {}),
    name: typeof v.name === 'string' ? v.name : `Visual ${i + 1}`,
    type: typeof v.type === 'string' ? v.type : 'Other',
    measures: asArray<string>(v.measures),
    columns: asArray<string>(v.columns),
    fields: asArray<string>(v.fields),
  }));
  const usageMetrics = normalizeUsageMetrics(o.usageMetrics);
  const usageMeta = normalizeUsageMeta(o.usageMeta);
  return {
    ...(typeof o.name === 'string' && o.name ? { name: o.name } : {}),
    tables,
    visuals,
    ...(usageMetrics?.length ? { usageMetrics } : {}),
    ...(usageMetrics?.length && usageMeta ? { usageMeta } : {}),
  };
}
