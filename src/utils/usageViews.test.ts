import { describe, expect, it } from 'vitest';
import { analyzeModel } from '../engine';
import { demoModel } from '../data/demoData';
import { pageBreakdowns } from './usageViews';

describe('page breakdowns', () => {
  const rows = pageBreakdowns(analyzeModel(demoModel));
  const by = (page: string) => rows.find((r) => r.page === page)!;

  it('lists all model pages sorted by views with their usage row', () => {
    expect(rows.map((r) => [r.page, r.views])).toEqual([['Schadenübersicht', 1250], ['Vertragsübersicht', 340], ['Archiv', 0]]);
    expect(by('Schadenübersicht')).toMatchObject({ hasUsageRow: true, uniqueUsers: 320, rows: 3 });
  });

  it('separates direct, field-parameter and dependency measures per page (disjoint)', () => {
    const s = by('Schadenübersicht');
    expect(s.directMeasures).toEqual(['KPI[SQ_Gesamt]']);
    expect(s.parameterMeasures).toEqual([]);
    expect([...s.dependencyMeasures].sort()).toEqual(['Claims[Schaden_Aufwand]', 'Finance[ABGP_Gesamt]', 'Finance[Aufwand_Gesamt]']);
    const v = by('Vertragsübersicht');
    expect(v.directMeasures).toEqual([]);
    expect([...v.parameterMeasures].sort()).toEqual(['Claims[Schadenzahl]', 'Contracts[Vertrag_Aktiv]', 'Finance[ABGP_Gesamt]']);
    expect(v.visuals.find((x) => x.name === 'Kennzahl Slicer')!.parameters[0]).toMatchObject({ name: 'Kennzahl Auswahl' });
    expect(by('Archiv').directMeasures).toEqual(['KPI[JNP]']);
    expect([...by('Archiv').dependencyMeasures].sort()).toEqual(['Contracts[Vertrag_Aktiv]', 'Finance[ABGP_Gesamt]']);
  });

  it('pages without a usage row are still listed', () => {
    const a = analyzeModel({ ...demoModel, usageMetrics: [{ page: 'Archiv', views: 5 }] });
    const r = pageBreakdowns(a);
    expect(r.find((x) => x.page === 'Schadenübersicht')).toMatchObject({ hasUsageRow: false, views: 0 });
  });
});
