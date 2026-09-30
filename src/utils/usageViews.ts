import type { AnalysisResult, MeasureId } from '../types/powerbi';

/** One visual on a page with everything that makes measures reachable from it. */
export interface VisualBreakdown {
  id: string;
  name: string;
  type: string;
  directMeasures: MeasureId[];
  parameters: { id: string; name: string; members: MeasureId[] }[];
  /** measures reached only through dependencies of the direct / parameter measures */
  dependencyMeasures: MeasureId[];
}

/** A report page with its (optional) usage row and the measures technically connected to it. */
export interface PageBreakdown {
  page: string;
  hasUsageRow: boolean;
  views: number;
  /** sum over rows, NOT de-duplicated */
  uniqueUsers?: number;
  rows: number;
  dates: string[];
  visuals: VisualBreakdown[];
  /** disjoint page-level lists: direct first, then parameter candidates, then dependencies only */
  directMeasures: MeasureId[];
  parameterMeasures: MeasureId[];
  dependencyMeasures: MeasureId[];
}

const unique = <T,>(list: T[]): T[] => [...new Set(list)];

/** Pure: all model pages (with usage if present), sorted by views (desc), then name. */
export function pageBreakdowns(a: AnalysisResult): PageBreakdown[] {
  const usageByPage = new Map(a.usage.pages.map((p) => [p.page, p]));
  const visualsByPage = new Map<string, VisualBreakdown[]>();

  for (const v of a.visuals.values()) {
    const parameters = v.fieldParameters
      .map((id) => a.fieldParameters.get(id))
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
      .map((f) => ({ id: f.id, name: f.name, members: f.measures }));
    const covered = new Set<MeasureId>([...v.measures, ...parameters.flatMap((p) => p.members)]);
    const list = visualsByPage.get(v.page) ?? [];
    list.push({
      id: v.id, name: v.name, type: v.type,
      directMeasures: v.measures,
      parameters,
      dependencyMeasures: v.reachableMeasures.filter((m) => !covered.has(m)),
    });
    visualsByPage.set(v.page, list);
  }

  const rows: PageBreakdown[] = a.pages.map((page) => {
    const visuals = visualsByPage.get(page) ?? [];
    const direct = unique(visuals.flatMap((v) => v.directMeasures));
    const directSet = new Set(direct);
    const parameter = unique(visuals.flatMap((v) => v.parameters.flatMap((p) => p.members))).filter((m) => !directSet.has(m));
    const covered = new Set([...direct, ...parameter]);
    const dependencies = unique(visuals.flatMap((v) => v.dependencyMeasures)).filter((m) => !covered.has(m));
    const u = usageByPage.get(page);
    return {
      page, hasUsageRow: u !== undefined, views: u?.views ?? 0, uniqueUsers: u?.uniqueUsers, rows: u?.rows ?? 0, dates: u?.dates ?? [],
      visuals, directMeasures: direct, parameterMeasures: parameter, dependencyMeasures: dependencies,
    };
  });
  return rows.sort((x, y) => y.views - x.views || x.page.localeCompare(y.page));
}
