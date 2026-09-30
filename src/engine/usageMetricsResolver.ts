import type {
  AnalysisResult, MeasureId, MeasureUsageMetrics, PageUsage, UnmatchedReason, UnmatchedUsage, UsageAnalysis, UsageLevel,
  UsageMetric, UsageMetricsMeta,
} from '../types/powerbi';

/**
 * Links usage metrics (page views) to the technical model:
 *   usage row → report page → visuals on that page → direct / field-parameter / indirect measures.
 *
 * The result is an ESTIMATE of reach ("potential"), never a count of DAX executions or
 * field-parameter selections. Independent of the DAX parser and of any UI code.
 */

/** The technical analysis this resolver builds on (everything except the usage part itself). */
export type TechnicalAnalysis = Pick<AnalysisResult, 'measures' | 'visuals' | 'pages'>;

export interface UsageMetricsInput {
  metrics?: UsageMetric[];
  meta?: UsageMetricsMeta;
  /** Name of the loaded report/model, used to pick the right report inside a workspace-wide export */
  reportName?: string;
}

/** trim, collapse repeated whitespace, ignore case. No fuzzy matching. */
export const normalizeName = (s: string | undefined): string => (s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

// ───────────────────────── Classification ─────────────────────────

/**
 * Relative classification without absolute thresholds: the mid-rank percentile of a value among all
 * positive potential-view values. Ties share their mid-rank, so equal values always get the same class
 * (all equal → MEDIUM). pct ≥ 2/3 → HIGH, ≥ 1/3 → MEDIUM, otherwise LOW.
 */
export function classifyByPercentile(value: number, sortedPositive: number[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  const n = sortedPositive.length;
  if (n === 0) return 'MEDIUM';
  let below = 0;
  while (below < n && sortedPositive[below] < value) below++;
  let equal = 0;
  while (below + equal < n && sortedPositive[below + equal] === value) equal++;
  const pct = (below + equal / 2) / n;
  if (pct >= 2 / 3) return 'HIGH';
  if (pct >= 1 / 3) return 'MEDIUM';
  return 'LOW';
}

export function usageLevel(pageViewsPotential: number, hasData: boolean, sortedPositive: number[]): UsageLevel {
  if (!hasData) return 'NO_USAGE_DATA';
  if (pageViewsPotential <= 0) return 'NO_OBSERVED_USAGE';
  return classifyByPercentile(pageViewsPotential, sortedPositive);
}

// ───────────────────────── Page matching ─────────────────────────

interface PageIndex {
  byId: Map<string, string>;
  byName: Map<string, Set<string>>;
}

function indexPages(a: TechnicalAnalysis): PageIndex {
  const byId = new Map<string, string>();
  const byName = new Map<string, Set<string>>();
  for (const v of a.visuals.values()) {
    const key = normalizeName(v.page);
    const names = byName.get(key) ?? new Set<string>();
    names.add(v.page);
    byName.set(key, names);
    if (v.pageId) byId.set(normalizeName(v.pageId), v.page);
  }
  return { byId, byName };
}

type MatchResult = { page: string } | { reason: UnmatchedReason };

function matchPage(row: UsageMetric, index: PageIndex): MatchResult {
  const byId = row.pageId ? index.byId.get(normalizeName(row.pageId)) : undefined;
  if (byId) return { page: byId };
  const key = normalizeName(row.page);
  if (!key) return { reason: 'page-not-found' };
  const names = index.byName.get(key);
  if (!names || names.size === 0) return { reason: 'page-not-found' };
  if (names.size > 1) return { reason: 'ambiguous-page' };
  return { page: [...names][0] };
}

function pickActiveReport(rows: UsageMetric[], input: UsageMetricsInput): { available: string[]; active?: string } {
  const available: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r.report?.trim() ?? '';
    const key = normalizeName(name);
    if (key && !seen.has(key)) {
      seen.add(key);
      available.push(name);
    }
  }
  const wanted = input.meta?.reportFilter?.trim();
  if (wanted) return { available, active: wanted };
  const byModelName = available.find((r) => normalizeName(r) === normalizeName(input.reportName));
  return { available, active: byModelName };
}

// ───────────────────────── Resolver ─────────────────────────

const sum = (pages: Iterable<string>, views: Map<string, number>) => {
  let total = 0;
  for (const p of pages) total += views.get(p) ?? 0;
  return total;
};

export function emptyUsageAnalysis(): UsageAnalysis {
  return {
    hasData: false, totalViews: 0, matchedViews: 0, unmatchedViews: 0, pages: [], unmatched: [], pagesWithoutUsage: [],
    availableReports: [], measures: new Map(), visualPageViews: new Map(),
    distribution: { measuresWithViews: 0, min: 0, median: 0, max: 0 },
  };
}

export function resolveUsageMetrics(input: UsageMetricsInput, tech: TechnicalAnalysis): UsageAnalysis {
  const rows = input.metrics ?? [];
  const hasData = rows.length > 0;
  const index = indexPages(tech);
  const { available, active } = pickActiveReport(rows, input);
  const activeKey = normalizeName(active);

  // 1) match rows to pages, aggregate per page (views summed over date rows; each page listed once)
  const acc = new Map<string, { views: number; users?: number; rows: number; dates: Set<string>; pageId?: string }>();
  const unmatchedAcc = new Map<string, UnmatchedUsage>();
  const addUnmatched = (row: UsageMetric, reason: UnmatchedReason) => {
    const key = `${normalizeName(row.report)}\u0000${normalizeName(row.page)}\u0000${reason}`;
    const cur = unmatchedAcc.get(key);
    if (cur) {
      cur.views += row.views;
      cur.rows += 1;
    } else {
      unmatchedAcc.set(key, { report: row.report?.trim() || undefined, page: row.page.trim(), views: row.views, rows: 1, reason });
    }
  };

  for (const row of rows) {
    if (activeKey && normalizeName(row.report) && normalizeName(row.report) !== activeKey) {
      addUnmatched(row, 'other-report');
      continue;
    }
    const m = matchPage(row, index);
    if ('reason' in m) {
      addUnmatched(row, m.reason);
      continue;
    }
    const cur = acc.get(m.page) ?? { views: 0, rows: 0, dates: new Set<string>(), pageId: undefined as string | undefined };
    cur.views += row.views;
    cur.rows += 1;
    if (row.uniqueUsers !== undefined) cur.users = (cur.users ?? 0) + row.uniqueUsers;
    if (row.date) cur.dates.add(row.date);
    cur.pageId ??= row.pageId;
    acc.set(m.page, cur);
  }

  const pages: PageUsage[] = [...acc.entries()]
    .map(([page, v]) => ({ page, pageId: v.pageId, views: v.views, uniqueUsers: v.users, rows: v.rows, dates: [...v.dates].sort() }))
    .sort((x, y) => y.views - x.views || x.page.localeCompare(y.page));
  const unmatched = [...unmatchedAcc.values()].sort((x, y) => y.views - x.views || x.page.localeCompare(y.page));
  const pageViews = new Map(pages.map((p) => [p.page, p.views]));
  const pageUsers = new Map(pages.map((p) => [p.page, p.uniqueUsers]));

  const visualPageViews = new Map<string, number>();
  for (const v of tech.visuals.values()) visualPageViews.set(v.id, pageViews.get(v.page) ?? 0);

  // 2) per measure: which distinct pages reach it, and how
  const pageOf = (visualId: string) => tech.visuals.get(visualId)?.page;
  const pagesOf = (ids: string[]) => new Set(ids.map(pageOf).filter((p): p is string => p !== undefined));

  type Draft = Omit<MeasureUsageMetrics, 'usageStatus'>;
  const drafts: Draft[] = [];
  for (const m of tech.measures.values()) {
    const direct = pagesOf(m.directVisuals);
    const param = pagesOf(m.fieldParameterVisuals);
    const indirect = pagesOf(m.indirectVisuals);
    const all = new Set([...direct, ...param, ...indirect]);
    const indirectOnly = [...indirect].filter((p) => !direct.has(p) && !param.has(p));
    const usersDefined = [...all].filter((p) => pageUsers.get(p) !== undefined);
    drafts.push({
      measureId: m.id,
      directVisualCount: m.directVisuals.length,
      indirectVisualCount: m.indirectVisuals.length,
      fieldParameterVisualCount: m.fieldParameterVisuals.length,
      pageViewsPotential: sum(all, pageViews),
      directPageViewsPotential: sum(direct, pageViews),
      indirectPageViewsPotential: sum(indirectOnly, pageViews),
      parameterCandidateViews: sum(param, pageViews),
      uniqueUsersPotential: usersDefined.length ? usersDefined.reduce((t, p) => t + (pageUsers.get(p) ?? 0), 0) : undefined,
      matchedPages: [...all].filter((p) => pageViews.has(p)).sort((x, y) => x.localeCompare(y)),
    });
  }

  const positives = drafts.map((d) => d.pageViewsPotential).filter((v) => v > 0).sort((x, y) => x - y);
  const measures = new Map<MeasureId, MeasureUsageMetrics>();
  for (const d of drafts) measures.set(d.measureId, { ...d, usageStatus: usageLevel(d.pageViewsPotential, hasData, positives) });

  const mid = Math.floor(positives.length / 2);
  const median = positives.length === 0 ? 0 : positives.length % 2 ? positives[mid] : (positives[mid - 1] + positives[mid]) / 2;
  const matchedViews = pages.reduce((t, p) => t + p.views, 0);
  const unmatchedViews = unmatched.reduce((t, u) => t + u.views, 0);

  return {
    hasData,
    totalViews: matchedViews + unmatchedViews,
    matchedViews,
    unmatchedViews,
    pages,
    unmatched,
    pagesWithoutUsage: tech.pages.filter((p) => !pageViews.has(p)),
    availableReports: available,
    activeReport: active,
    measures,
    visualPageViews,
    distribution: { measuresWithViews: positives.length, min: positives[0] ?? 0, median, max: positives[positives.length - 1] ?? 0 },
  };
}
