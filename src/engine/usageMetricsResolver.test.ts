import { describe, expect, it } from 'vitest';
import { analyzeModel } from './analyzeModel';
import { classifyByPercentile, normalizeName, usageLevel } from './usageMetricsResolver';
import type { ReportModel, UsageMetric, Visual } from '../types/powerbi';

const vis = (id: string, page: string, extra: Partial<Visual> = {}): Visual => ({
  id, page, name: id, type: 'Card', measures: [], columns: [], fields: [], ...extra,
});

/** A → B → C chain plus D (leaf) and U (unused). Field parameter "Auswahl" offers D. */
const model = (visuals: Visual[], usageMetrics?: UsageMetric[], name?: string): ReportModel => ({
  name,
  tables: [
    {
      name: 'T', columns: [],
      measures: [
        { name: 'A', dax: '[B]' }, { name: 'B', dax: '[C]' }, { name: 'C', dax: '1' },
        { name: 'D', dax: '[C] + 1' }, { name: 'U', dax: '1' },
      ],
    },
    { name: 'Auswahl', columns: [{ name: 'Auswahl' }], measures: [], dax: '{ ("d", NAMEOF([D]), 0) }' },
  ],
  visuals,
  ...(usageMetrics ? { usageMetrics } : {}),
});
const u = (m: ReportModel, id: string) => analyzeModel(m).usage.measures.get(id)!;

describe('usage metrics resolver', () => {
  it('direct measure usage', () => {
    const m = model([vis('v1', 'Overview', { measures: ['[A]'] })], [{ page: 'Overview', views: 100 }]);
    expect(u(m, 'T[A]')).toMatchObject({
      directVisualCount: 1, indirectVisualCount: 0, fieldParameterVisualCount: 0,
      pageViewsPotential: 100, directPageViewsPotential: 100, indirectPageViewsPotential: 0, parameterCandidateViews: 0,
      matchedPages: ['Overview'],
    });
  });

  it('indirect measure usage: reach only through dependencies', () => {
    const m = model([vis('v1', 'Overview', { measures: ['[A]'] })], [{ page: 'Overview', views: 100 }]);
    expect(u(m, 'T[C]')).toMatchObject({
      directVisualCount: 0, indirectVisualCount: 1, pageViewsPotential: 100,
      directPageViewsPotential: 0, indirectPageViewsPotential: 100, parameterCandidateViews: 0,
    });
    expect(u(m, 'T[B]').indirectVisualCount).toBe(1);
  });

  it('field parameter candidates get parameterCandidateViews, their dependencies count as indirect', () => {
    const m = model([vis('v1', 'KPI', { columns: ["Auswahl[Auswahl]"] })], [{ page: 'KPI', views: 1250 }]);
    expect(u(m, 'T[D]')).toMatchObject({
      directVisualCount: 0, fieldParameterVisualCount: 1, pageViewsPotential: 1250, directPageViewsPotential: 0,
      indirectPageViewsPotential: 0, parameterCandidateViews: 1250,
    });
    expect(u(m, 'T[C]')).toMatchObject({ indirectVisualCount: 1, indirectPageViewsPotential: 1250, parameterCandidateViews: 0, fieldParameterVisualCount: 0 });
    expect(u(m, 'T[A]').pageViewsPotential).toBe(0); // not offered by the parameter
  });

  it('never counts the views of a page twice per measure (several visuals, several roles)', () => {
    const m = model(
      [
        vis('v1', 'P', { measures: ['[D]'] }),
        vis('v2', 'P', { measures: ['[D]'] }),
        vis('v3', 'P', { columns: ['Auswahl[Auswahl]'] }),
        vis('v4', 'P', { measures: ['[A]'] }),
      ],
      [{ page: 'P', views: 500 }],
    );
    const d = u(m, 'T[D]');
    expect(d.directVisualCount).toBe(2);
    expect(d.fieldParameterVisualCount).toBe(1);
    expect(d.pageViewsPotential).toBe(500);
    expect(d.directPageViewsPotential).toBe(500);
    expect(d.parameterCandidateViews).toBe(500);
    expect(d.matchedPages).toEqual(['P']);
    const c = u(m, 'T[C]'); // reachable from v1, v2 (via D), v3 (via D) and v4 (via A) → four visual paths, one page
    expect(c.indirectVisualCount).toBe(4);
    expect(c.pageViewsPotential).toBe(500);
    expect(c.indirectPageViewsPotential).toBe(500);
    // reason paths still know all visuals
    expect(analyzeModel(m).measures.get('T[D]')!.allVisuals.sort()).toEqual(['v1', 'v2', 'v3']);
  });

  it('sums views over several date rows of the same page and lists the page once', () => {
    const m = model(
      [vis('v1', 'Overview', { measures: ['[A]'] })],
      [
        { page: 'Overview', views: 10, uniqueUsers: 4, date: '2026-01-01' },
        { page: 'Overview', views: 20, uniqueUsers: 5, date: '2026-01-02' },
        { page: 'Overview', views: 30, date: '2026-01-03' },
      ],
    );
    const a = analyzeModel(m);
    expect(a.usage.pages).toEqual([{ page: 'Overview', pageId: undefined, views: 60, uniqueUsers: 9, rows: 3, dates: ['2026-01-01', '2026-01-02', '2026-01-03'] }]);
    expect(u(m, 'T[A]')).toMatchObject({ pageViewsPotential: 60, matchedPages: ['Overview'] });
    // unique users are only summed, never presented as a de-duplicated total
    expect(u(m, 'T[A]').uniqueUsersPotential).toBe(9);
  });

  it('unique-user sums of different pages are not de-duplicated and stay undefined without data', () => {
    const m = model(
      [vis('v1', 'P1', { measures: ['[A]'] }), vis('v2', 'P2', { measures: ['[A]'] })],
      [{ page: 'P1', views: 5, uniqueUsers: 3 }, { page: 'P2', views: 5, uniqueUsers: 3 }],
    );
    expect(u(m, 'T[A]').uniqueUsersPotential).toBe(6);
    const noUsers = model([vis('v1', 'P1', { measures: ['[A]'] })], [{ page: 'P1', views: 5 }]);
    expect(u(noUsers, 'T[A]').uniqueUsersPotential).toBeUndefined();
  });

  it('reports rows that cannot be matched and never fuzzy-matches', () => {
    const m = model([vis('v1', 'Overview', { measures: ['[A]'] })], [
      { page: 'Overview', views: 10 },
      { page: 'Overviews', views: 7 },
      { page: 'Alte Seite', views: 3 },
      { page: 'Alte Seite', views: 4 },
      { page: '', views: 1 },
    ]);
    const a = analyzeModel(m);
    expect(a.usage.unmatched).toEqual([
      { report: undefined, page: 'Overviews', views: 7, rows: 1, reason: 'page-not-found' },
      { report: undefined, page: 'Alte Seite', views: 7, rows: 2, reason: 'page-not-found' },
      { report: undefined, page: '', views: 1, rows: 1, reason: 'page-not-found' },
    ].sort((x, y) => y.views - x.views || x.page.localeCompare(y.page)));
    expect(a.usage.matchedViews).toBe(10);
    expect(a.usage.unmatchedViews).toBe(15);
    expect(a.usage.totalViews).toBe(25);
  });

  it('matches pages ignoring case and repeated whitespace; page ids win; equal names are ambiguous', () => {
    expect(normalizeName('  Schaden   Übersicht ')).toBe('schaden übersicht');
    const m = model(
      [vis('v1', 'Schaden Übersicht', { measures: ['[A]'], pageId: 'ReportSection1' }), vis('v2', 'Other', { measures: ['[D]'], pageId: 'ReportSection2' })],
      [
        { page: '  schaden   ÜBERSICHT ', views: 10 },
        { page: 'Renamed in the service', pageId: 'reportsection2', views: 20 },
      ],
    );
    const a = analyzeModel(m);
    expect(a.usage.pages.map((p) => [p.page, p.views])).toEqual([['Other', 20], ['Schaden Übersicht', 10]]);
    expect(a.usage.unmatched).toEqual([]);

    const ambiguous = model([vis('v1', 'A', { measures: ['[A]'] }), vis('v2', 'a', { measures: ['[A]'] })], [{ page: 'A', views: 5 }]);
    expect(analyzeModel(ambiguous).usage.unmatched).toEqual([{ report: undefined, page: 'A', views: 5, rows: 1, reason: 'ambiguous-page' }]);
  });

  it('uses the report name to pick rows of the right report, or an explicit filter', () => {
    const rows: UsageMetric[] = [
      { report: 'Sales', page: 'Overview', views: 10 },
      { report: 'Other report', page: 'Overview', views: 99 },
      { page: 'Overview', views: 1 },
    ];
    const visuals = [vis('v1', 'Overview', { measures: ['[A]'] })];
    const auto = analyzeModel(model(visuals, rows, 'sales'));
    expect(auto.usage.activeReport).toBe('Sales');
    expect(auto.usage.pages[0].views).toBe(11);
    expect(auto.usage.unmatched).toEqual([{ report: 'Other report', page: 'Overview', views: 99, rows: 1, reason: 'other-report' }]);
    expect(auto.usage.availableReports).toEqual(['Sales', 'Other report']);
    // model name matches no report → rows are matched by page only
    expect(analyzeModel(model(visuals, rows, 'Something else')).usage.pages[0].views).toBe(110);
    // explicit filter in the usage metadata
    const filtered = { ...model(visuals, rows, 'Something else'), usageMeta: { imports: [], reportFilter: 'Other report' } };
    expect(analyzeModel(filtered).usage.pages[0].views).toBe(100);
  });

  it('without usage data every measure is NO_USAGE_DATA and all view numbers are zero', () => {
    const a = analyzeModel(model([vis('v1', 'Overview', { measures: ['[A]'] })]));
    expect(a.usage.hasData).toBe(false);
    for (const x of a.usage.measures.values()) {
      expect(x.usageStatus).toBe('NO_USAGE_DATA');
      expect(x.pageViewsPotential).toBe(0);
    }
    expect(a.usage.measures.get('T[A]')!.directVisualCount).toBe(1); // technical counts are always available
    expect(a.usage.totalViews).toBe(0);
  });

  it('a technically used measure without views is NO_OBSERVED_USAGE, not unused', () => {
    const m = model(
      [vis('v1', 'Busy', { measures: ['[A]'] }), vis('v2', 'Quiet', { measures: ['[D]'] })],
      [{ page: 'Busy', views: 50 }, { page: 'Quiet', views: 0 }],
    );
    const a = analyzeModel(m);
    expect(a.measures.get('T[D]')!.status).toBe('direct');
    expect(a.usage.measures.get('T[D]')!.usageStatus).toBe('NO_OBSERVED_USAGE');
    expect(a.usage.measures.get('T[D]')!.matchedPages).toEqual(['Quiet']);
    expect(a.usage.measures.get('T[U]')!.usageStatus).toBe('NO_OBSERVED_USAGE'); // unused technically as well
    expect(a.measures.get('T[U]')!.status).toBe('unused');
    // C is reachable on both pages, so it has views
    expect(a.usage.measures.get('T[C]')!.pageViewsPotential).toBe(50);
  });

  it('identical positive values are classified consistently without division by zero', () => {
    const m = model(
      [vis('v1', 'P', { measures: ['[A]'] }), vis('v2', 'P', { measures: ['[D]'] })],
      [{ page: 'P', views: 42 }],
    );
    const a = analyzeModel(m);
    const levels = ['T[A]', 'T[B]', 'T[C]', 'T[D]'].map((id) => a.usage.measures.get(id)!.usageStatus);
    expect(levels).toEqual(['MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM']);
    expect(a.usage.distribution).toEqual({ measuresWithViews: 4, min: 42, median: 42, max: 42 });
    expect(classifyByPercentile(5, [5])).toBe('MEDIUM');
    expect(classifyByPercentile(1, [])).toBe('MEDIUM');
  });

  it('HIGH / MEDIUM / LOW are derived from the relative distribution of potential views', () => {
    const sorted = [10, 20, 30, 40, 50, 60];
    expect(usageLevel(60, true, sorted)).toBe('HIGH');
    expect(usageLevel(50, true, sorted)).toBe('HIGH');
    expect(usageLevel(40, true, sorted)).toBe('MEDIUM');
    expect(usageLevel(30, true, sorted)).toBe('MEDIUM');
    expect(usageLevel(20, true, sorted)).toBe('LOW');
    expect(usageLevel(10, true, sorted)).toBe('LOW');
    expect(usageLevel(0, true, sorted)).toBe('NO_OBSERVED_USAGE');
    expect(usageLevel(10, false, sorted)).toBe('NO_USAGE_DATA');
    // ties share their rank
    expect(usageLevel(20, true, [10, 20, 20, 20, 20, 90])).toBe('MEDIUM');
  });

  it('is deterministic and does not mutate the input model', () => {
    const m = model([vis('v1', 'Overview', { measures: ['[A]'] })], [{ page: 'Overview', views: 10, date: '2026-01-01' }]);
    const snapshot = JSON.stringify(m);
    const first = analyzeModel(m);
    const second = analyzeModel(m);
    expect(JSON.stringify(m)).toBe(snapshot);
    expect([...first.usage.measures.entries()]).toEqual([...second.usage.measures.entries()]);
  });

  it('circular dependencies do not disturb the usage resolution', () => {
    const m: ReportModel = {
      tables: [{ name: 'T', columns: [], measures: [{ name: 'A', dax: '[B]' }, { name: 'B', dax: '[A]' }] }],
      visuals: [vis('v1', 'P', { measures: ['[A]'] })],
      usageMetrics: [{ page: 'P', views: 8 }],
    };
    const a = analyzeModel(m);
    expect(a.usage.measures.get('T[B]')!.pageViewsPotential).toBe(8);
    expect(a.usage.measures.get('T[A]')!.pageViewsPotential).toBe(8);
  });
});
