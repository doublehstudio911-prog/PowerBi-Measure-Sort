import { describe, expect, it } from 'vitest';
import { analyzeModel } from './analyzeModel';
import { technicalReasonPath } from '../utils/reasons';
import type { ReportModel, Visual } from '../types/powerbi';

const vis = (name: string, extra: Partial<Visual> = {}): Visual => ({
  id: name, page: 'Übersicht', name, type: 'Card', measures: [], columns: [], fields: [], ...extra,
});

const fpDax = (...refs: string[]) => `{\n${refs.map((r, i) => `  ("Item ${i}", NAMEOF(${r}), ${i})`).join(',\n')}\n}`;

/** Model: KPI Auswahl (field parameter) → SQ_Gesamt → Aufwand_Gesamt → Schaden_Aufwand */
const base = (visuals: Visual[], extraTables: ReportModel['tables'] = []): ReportModel => ({
  tables: [
    {
      name: 'Measures', columns: [],
      measures: [
        { name: 'SQ_Gesamt', dax: 'DIVIDE([Aufwand_Gesamt], 1)' },
        { name: 'Aufwand_Gesamt', dax: 'SUMX(Schaden, [Schaden_Aufwand])' },
        { name: 'Other', dax: '1' },
      ],
    },
    { name: 'Schaden', columns: [{ name: 'X' }], measures: [{ name: 'Schaden_Aufwand', dax: 'SUM(Schaden[X])' }] },
    {
      name: 'KPI Auswahl',
      columns: [{ name: 'KPI Auswahl' }, { name: 'KPI Auswahl Fields' }],
      measures: [],
      dax: fpDax("'Measures'[SQ_Gesamt]"),
    },
    ...extraTables,
  ],
  visuals,
});

describe('field parameters', () => {
  it('a visual using the parameter keeps its measures alive; dependencies become indirect', () => {
    const a = analyzeModel(base([vis('KPI Visual', { columns: ["'KPI Auswahl'[KPI Auswahl]"] })]));
    expect(a.fieldParameters.get('fp:KPI Auswahl')!.isUsed).toBe(true);
    const sq = a.measures.get('Measures[SQ_Gesamt]')!;
    expect(sq.isUsed).toBe(true);
    expect(sq.fieldParameters).toEqual(['fp:KPI Auswahl']);
    expect(sq.fieldParameterVisuals).toEqual(['KPI Visual']);
    expect(a.measures.get('Measures[Aufwand_Gesamt]')!.status).toBe('indirect');
    expect(a.measures.get('Schaden[Schaden_Aufwand]')!.status).toBe('indirect');
    expect(a.measures.get('Measures[Other]')!.status).toBe('unused');
    expect(a.summary).toMatchObject({ fieldParameters: 1, usedFieldParameters: 1, unusedMeasures: 1 });
  });

  it('an unused field parameter keeps nothing alive', () => {
    const a = analyzeModel(base([vis('Plain Card', { measures: ['[Other]'] })]));
    const fp = a.fieldParameters.get('fp:KPI Auswahl')!;
    expect(fp.isUsed).toBe(false);
    expect(fp.measures).toEqual(['Measures[SQ_Gesamt]']);
    for (const id of ['Measures[SQ_Gesamt]', 'Measures[Aufwand_Gesamt]', 'Schaden[Schaden_Aufwand]']) {
      expect(a.measures.get(id)!.status).toBe('unused');
      expect(a.measures.get(id)!.fieldParameters).toEqual([]);
    }
  });

  it('reason path is Page → Visual → Field Parameter → Measure → … and the graph data agrees', () => {
    const a = analyzeModel(base([vis('KPI Visual', { columns: ["'KPI Auswahl'[KPI Auswahl Fields]"] })]));
    const sa = a.measures.get('Schaden[Schaden_Aufwand]')!;
    expect(sa.reason).toEqual({
      root: { kind: 'visual', visualId: 'KPI Visual', fieldParameter: 'fp:KPI Auswahl' },
      chain: ['Measures[SQ_Gesamt]', 'Measures[Aufwand_Gesamt]', 'Schaden[Schaden_Aufwand]'],
    });
    expect(technicalReasonPath(a, sa)).toBe(
      'Page: Übersicht › Visual: KPI Visual › Field Parameter: KPI Auswahl › SQ_Gesamt › Aufwand_Gesamt › Schaden_Aufwand',
    );
  });

  it('a directly referenced measure keeps a plain visual reason even if it is also a parameter member', () => {
    const a = analyzeModel(base([
      vis('Direct', { measures: ['Measures[SQ_Gesamt]'] }),
      vis('Param', { columns: ["'KPI Auswahl'[KPI Auswahl]"] }),
    ]));
    const sq = a.measures.get('Measures[SQ_Gesamt]')!;
    expect(sq.status).toBe('direct');
    expect(sq.reason!.root).toEqual({ kind: 'visual', visualId: 'Direct' });
    expect(sq.fieldParameterVisuals).toEqual(['Param']);
    expect(sq.allVisuals.sort()).toEqual(['Direct', 'Param']);
  });

  it('a measure in several field parameters is de-duplicated and lists every used parameter', () => {
    const extra = [{ name: 'Zweite Auswahl', columns: [{ name: 'Zweite Auswahl' }], measures: [], dax: fpDax('[SQ_Gesamt]', "'Measures'[SQ_Gesamt]", '[Other]') }];
    const a = analyzeModel(base([
      vis('V1', { columns: ["'KPI Auswahl'[KPI Auswahl]"] }),
      vis('V2', { columns: ["'Zweite Auswahl'[Zweite Auswahl]"] }),
    ], extra));
    expect(a.fieldParameters.get('fp:Zweite Auswahl')!.measures).toEqual(['Measures[SQ_Gesamt]', 'Measures[Other]']);
    const sq = a.measures.get('Measures[SQ_Gesamt]')!;
    expect(sq.fieldParameters).toEqual(['fp:KPI Auswahl', 'fp:Zweite Auswahl']);
    expect(sq.fieldParameterVisuals.sort()).toEqual(['V1', 'V2']);
    expect(a.summary.usedMeasures).toBe(4);
  });

  it('a circular dependency behind a field parameter terminates', () => {
    const model: ReportModel = {
      tables: [
        { name: 'T', columns: [], measures: [{ name: 'A', dax: '[B]' }, { name: 'B', dax: '[C]' }, { name: 'C', dax: '[A]' }, { name: 'Z', dax: '1' }] },
        { name: 'P', columns: [{ name: 'P' }], measures: [], dax: fpDax('[A]') },
      ],
      visuals: [vis('V', { columns: ['P[P]'] })],
    };
    const a = analyzeModel(model);
    expect(a.cycles).toHaveLength(1);
    expect(a.cycles[0].members).toEqual(['T[A]', 'T[B]', 'T[C]']);
    for (const id of ['T[A]', 'T[B]', 'T[C]']) expect(a.measures.get(id)!.isUsed).toBe(true);
    expect(a.measures.get('T[Z]')!.status).toBe('unused');
    expect(a.measures.get('T[C]')!.reason!.chain).toEqual(['T[A]', 'T[B]', 'T[C]']);
  });

  it('measures of a used parameter appear in the visual reach; unqualified column references also count', () => {
    const a = analyzeModel(base([vis('V', { fields: ['KPI Auswahl.KPI Auswahl'] })]));
    expect(a.visuals.get('V')!.fieldParameters).toEqual(['fp:KPI Auswahl']);
    expect(a.visuals.get('V')!.reachableMeasures.sort()).toEqual(['Measures[Aufwand_Gesamt]', 'Measures[SQ_Gesamt]', 'Schaden[Schaden_Aufwand]']);
  });

  it('NAMEOF of columns yields column members, not measures, and a normal table is not a field parameter', () => {
    const a = analyzeModel(base([], [{ name: 'Spalten', columns: [], measures: [], dax: fpDax('Schaden[X]') }]));
    expect(a.fieldParameters.get('fp:Spalten')!.measures).toEqual([]);
    expect(a.fieldParameters.get('fp:Spalten')!.columns).toEqual([{ table: 'Schaden', column: 'X' }]);
    expect(a.fieldParameters.has('fp:Schaden')).toBe(false);
    expect(a.tables.get('KPI Auswahl')!.isFieldParameter).toBe(true);
    expect(a.tables.get('Schaden')!.isFieldParameter).toBe(false);
  });
});
