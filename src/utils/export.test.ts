import { describe, expect, it } from 'vitest';
import { analyzeModel } from '../engine';
import { demoModel } from '../data/demoData';
import { MEASURE_HEADERS, measureRows, toCsv, toJson } from './export';

describe('export', () => {
  const a = analyzeModel(demoModel);
  it('CSV has the required header and one row per measure', () => {
    const lines = toCsv(a).split('\r\n');
    expect(lines[0].startsWith('Measure,Table,Status,DirectUsage,IndirectUsage,UsedBy')).toBe(true);
    expect(lines).toHaveLength(11);
    expect(lines.some((l) => l.startsWith('Test_Measure,Claims,Unused,0,0'))).toBe(true);
  });
  it('JSON contains the full structure', () => {
    const j = JSON.parse(toJson(a));
    expect(j.summary.unusedMeasures).toBe(3);
    expect(j.measures).toHaveLength(10);
    expect(j.measures.find((m: { id: string }) => m.id === 'Claims[Schaden_Aufwand]').reason.chain).toHaveLength(3);
  });

  it('CSV appends the usage columns and keeps the original ones; JSON carries usage, parameters and matching results', () => {
    const header = toCsv(a).split('\r\n')[0].split(',');
    expect(header.slice(0, 6)).toEqual(['Measure', 'Table', 'Status', 'DirectUsage', 'IndirectUsage', 'UsedBy']);
    for (const h of ['TechnicalStatus', 'UsageStatus', 'DirectVisualCount', 'IndirectVisualCount', 'FieldParameterVisualCount', 'PageViewsPotential',
      'DirectPageViewsPotential', 'IndirectPageViewsPotential', 'ParameterCandidateViews', 'MatchedPages', 'UsageReason', 'TechnicalReasonPath']) {
      expect(header).toContain(h);
    }
    const rows = measureRows(a);
    const col = (name: string) => MEASURE_HEADERS.indexOf(name);
    const abgp = rows.find((r) => r[0] === 'ABGP_Gesamt')!;
    expect(abgp[col('UsageStatus')]).toBe('HIGH');
    expect(abgp[col('PageViewsPotential')]).toBe(1590);
    expect(abgp[col('ParameterCandidateViews')]).toBe(340);
    expect(abgp[col('FieldParameters')]).toBe('Kennzahl Auswahl');
    const zahl = rows.find((r) => r[0] === 'Schadenzahl')!;
    expect(zahl[col('TechnicalReasonPath')]).toBe('Page: Vertragsübersicht › Visual: Kennzahl Slicer › Field Parameter: Kennzahl Auswahl › Schadenzahl');
    expect(rows.find((r) => r[0] === 'JNP')![col('UsageStatus')]).toBe('NO_OBSERVED_USAGE');
    expect(rows.find((r) => r[0] === 'Test_Measure')![col('TechnicalStatus')]).toBe('UNUSED');

    const j = JSON.parse(toJson(a));
    expect(j.usageMetrics).toMatchObject({ loaded: true, totalViews: 1680 + 500, matchedViews: 1590, unmatchedViews: 590 });
    expect(j.usageMetrics.unmatched.map((u: { reason: string }) => u.reason).sort()).toEqual(['other-report', 'page-not-found']);
    expect(j.fieldParameters.map((f: { name: string; isUsed: boolean }) => [f.name, f.isUsed])).toEqual([['Kennzahl Auswahl', true], ['Alt Auswahl', false]]);
    expect(j.measures.find((m: { id: string }) => m.id === 'Claims[Schadenzahl]').usage.parameterCandidateViews).toBe(340);
  });

  it('demo data shows the new features', () => {
    expect(a.usage.pages.map((p) => [p.page, p.views])).toEqual([['Schadenübersicht', 1250], ['Vertragsübersicht', 340], ['Archiv', 0]]);
    expect(a.usage.pagesWithoutUsage).toEqual([]);
    const level = (id: string) => a.usage.measures.get(id)!.usageStatus;
    expect(new Set([...a.usage.measures.values()].map((m) => m.usageStatus))).toEqual(new Set(['HIGH', 'MEDIUM', 'LOW', 'NO_OBSERVED_USAGE']));
    expect(level('Claims[Test_Measure]')).toBe('NO_OBSERVED_USAGE');
    expect(a.measures.get('Claims[Test_Measure]')!.status).toBe('unused');
    expect(a.measures.get('Finance[Debug_Measure]')!.fieldParameters).toEqual([]); // parameter "Alt Auswahl" is not used
    expect(a.measures.get('Claims[Schadenzahl]')!.status).toBe('indirect');
    expect(a.measures.get('Claims[Schadenzahl]')!.isDirect).toBe(false);
  });
});
