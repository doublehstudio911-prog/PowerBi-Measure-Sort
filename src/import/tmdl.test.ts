import { describe, expect, it } from 'vitest';
import { parseTmdl } from './tmdl';
import { processSources, toSource } from './registry';
import { analyzeModel } from '../engine';

const T = '\t';
const salesTmdl = [
  '/// Sales fact table',
  'table Sales',
  `${T}lineageTag: 1234`,
  '',
  `${T}measure Revenue = SUM(Sales[Amount])`,
  `${T}${T}formatString: #,0`,
  `${T}${T}lineageTag: a`,
  '',
  `${T}measure 'Loss Ratio' =`,
  `${T}${T}${T}DIVIDE(`,
  `${T}${T}${T}${T}[Claims Amount],`,
  `${T}${T}${T}${T}[Revenue]`,
  `${T}${T}${T})`,
  `${T}${T}displayFolder: KPI`,
  `${T}${T}lineageTag: b`,
  '',
  `${T}measure 'Claims Amount' = \`\`\``,
  `${T}${T}${T}VAR x = 1`,
  `${T}${T}${T}RETURN SUM(Sales[Claims]) * x`,
  `${T}${T}${T}\`\`\``,
  `${T}${T}lineageTag: c`,
  '',
  `${T}measure Unused = 1`,
  '',
  `${T}column Amount`,
  `${T}${T}dataType: double`,
  `${T}${T}sourceColumn: Amount`,
  '',
  `${T}column Doppelt = [Revenue] * 2`,
  `${T}${T}dataType: double`,
  '',
  `${T}partition Sales = m`,
  `${T}${T}mode: import`,
  `${T}${T}source =`,
  `${T}${T}${T}${T}let x = 1 in x`,
  '',
  `${T}annotation PBI_ResultType = Table`,
].join('\n');

describe('TMDL', () => {
  it('parses inline, multi-line, fenced measures, columns and skips partitions', () => {
    const [t] = parseTmdl(salesTmdl);
    expect(t.name).toBe('Sales');
    expect(t.measures.map((m) => m.name)).toEqual(['Revenue', 'Loss Ratio', 'Claims Amount', 'Unused']);
    expect(t.measures[0].dax).toBe('SUM(Sales[Amount])');
    expect(t.measures[1].dax).toContain('DIVIDE(');
    expect(t.measures[1].dax).toContain('[Claims Amount]');
    expect(t.measures[1].displayFolder).toBe('KPI');
    expect(t.measures[2].dax).toBe('VAR x = 1\nRETURN SUM(Sales[Claims]) * x');
    expect(t.measures[3].dax).toBe('1');
    expect(t.columns).toEqual([
      { name: 'Amount', dataType: 'double' },
      { name: 'Doppelt', dataType: 'double', calculated: true, dax: '[Revenue] * 2' },
    ]);
  });

  it('handles quoted table names and CRLF', () => {
    const [t] = parseTmdl("table 'My ''Table'''\r\n\tmeasure A = 1\r\n");
    expect(t.name).toBe("My 'Table'");
    expect(t.measures[0].dax).toBe('1');
  });

  it('full PBIP flow: tmdl files + PBIR page/visual files', () => {
    const visual = (name: string, measure: string) => JSON.stringify({
      name, visual: { visualType: 'card', query: { queryState: { Values: { projections: [
        { field: { Measure: { Expression: { SourceRef: { Entity: 'Sales' } }, Property: measure } } },
      ] } } } },
    });
    const { outcomes, model } = processSources([
      toSource('Proj.SemanticModel/definition/model.tmdl', 'model Model\n\tculture: de-DE\n', true),
      toSource('Proj.SemanticModel/definition/tables/Sales.tmdl', salesTmdl, true),
      toSource('Proj.SemanticModel/definition.pbism', '{"version":"4.0"}', true),
      toSource('Proj.Report/definition/pages/p1/page.json', JSON.stringify({ name: 'p1', displayName: 'Übersicht' }), true),
      toSource('Proj.Report/definition/pages/p1/visuals/v1/visual.json', visual('v1', 'Loss Ratio'), true),
      toSource('Proj.Report/definition/report.json', '{"themeCollection":{}}', true),
    ]);
    expect(outcomes.every((o) => !o.error)).toBe(true);
    const a = analyzeModel(model!);
    expect(a.visuals.get('p1/v1')!.page).toBe('Übersicht');
    const s = (id: string) => a.measures.get(id)!.status;
    expect(s('Sales[Loss Ratio]')).toBe('direct');
    expect(s('Sales[Claims Amount]')).toBe('indirect');
    expect(s('Sales[Revenue]')).toBe('indirect');
    expect(s('Sales[Unused]')).toBe('unused');
  });

  it('measure used only in visual conditional formatting counts as used', () => {
    const v = JSON.stringify({ name: 'v', visual: { visualType: 'table', objects: { values: [{ properties: { fontColor: { solid: { color: { expr: { Conditional: { Cases: [{ Condition: { Measure: { Expression: { SourceRef: { Entity: 'T' } }, Property: 'Flag' } } }] } } } } } } }] } } });
    const { model } = processSources([
      toSource('t.tmdl', 'table T\n\tmeasure Flag = 1\n\tmeasure Other = 2\n'),
      toSource('pages/p/visuals/v/visual.json', v),
    ]);
    const a = analyzeModel(model!);
    expect(a.measures.get('T[Flag]')!.status).toBe('direct');
    expect(a.measures.get('T[Other]')!.status).toBe('unused');
  });
});

describe('TMDL – field parameters (calculated tables)', () => {
  const fieldParameter = [
    "table 'KPI Auswahl'",
    `${T}lineageTag: 1`,
    '',
    `${T}column 'KPI Auswahl'`,
    `${T}${T}dataType: string`,
    `${T}${T}sourceColumn: [Value1]`,
    `${T}${T}sortByColumn: 'KPI Auswahl Order'`,
    '',
    `${T}${T}relatedColumnDetails`,
    `${T}${T}${T}groupByColumn: 'KPI Auswahl Fields'`,
    '',
    `${T}column 'KPI Auswahl Fields'`,
    `${T}${T}isHidden`,
    `${T}${T}sourceColumn: [Value2]`,
    `${T}${T}extendedProperty ParameterMetadata =`,
    `${T}${T}${T}${T}{`,
    `${T}${T}${T}${T}  "version": 3,`,
    `${T}${T}${T}${T}  "kind": 2`,
    `${T}${T}${T}${T}}`,
    '',
    `${T}column 'KPI Auswahl Order'`,
    `${T}${T}isHidden`,
    `${T}${T}sourceColumn: [Value3]`,
    '',
    `${T}partition 'KPI Auswahl' = calculated`,
    `${T}${T}mode: import`,
    `${T}${T}source =`,
    `${T}${T}${T}${T}{`,
    `${T}${T}${T}${T}${T}("Gesamt", NAMEOF('Measures'[SQ_Gesamt]), 0),`,
    `${T}${T}${T}${T}${T}("Aufwand", NAMEOF([Aufwand_Gesamt]), 1),`,
    `${T}${T}${T}${T}${T}("Schaden", NAMEOF(Schaden[Schaden_Aufwand]), 2)`,
    `${T}${T}${T}${T}}`,
    '',
    `${T}annotation PBI_Id = abc`,
  ].join('\n');

  it('captures the DAX of a calculated table partition', () => {
    const [t] = parseTmdl(fieldParameter);
    expect(t.name).toBe('KPI Auswahl');
    expect(t.columns.map((c) => c.name)).toEqual(['KPI Auswahl', 'KPI Auswahl Fields', 'KPI Auswahl Order']);
    expect(t.dax).toContain("NAMEOF('Measures'[SQ_Gesamt])");
    expect(t.dax).toContain('NAMEOF(Schaden[Schaden_Aufwand])');
    expect(t.dax!.startsWith('{')).toBe(true);
    expect(t.dax!.endsWith('}')).toBe(true);
  });

  it('ignores import (Power Query) partitions and keeps measures parsed after the partition', () => {
    const [t] = parseTmdl(['table Sales', `${T}partition Sales = m`, `${T}${T}mode: import`, `${T}${T}source =`, `${T}${T}${T}${T}let x = 1 in x`, `${T}measure A = 1`].join('\n'));
    expect(t.dax).toBeUndefined();
    expect(t.measures.map((m) => m.name)).toEqual(['A']);
  });

  it('field parameter from TMDL + PBIR keeps measures alive end to end', () => {
    const measures = ['table Measures', `${T}measure SQ_Gesamt = [Aufwand_Gesamt]`, `${T}measure Aufwand_Gesamt = SUM(Schaden[X])`, `${T}measure Aufwand_Gesamt2 = 1`].join('\n');
    const visual = JSON.stringify({ name: 'v1', visual: { visualType: 'card', query: { queryState: { Values: { projections: [
      { field: { Column: { Expression: { SourceRef: { Entity: 'KPI Auswahl' } }, Property: 'KPI Auswahl Fields' } } },
    ] } } } } });
    const { model } = processSources([
      toSource('def/tables/Measures.tmdl', measures),
      toSource('def/tables/KPI Auswahl.tmdl', fieldParameter),
      toSource('def/tables/Schaden.tmdl', ['table Schaden', `${T}measure Schaden_Aufwand = 1`].join('\n')),
      toSource('rep/pages/p1/page.json', JSON.stringify({ name: 'p1', displayName: 'Übersicht' })),
      toSource('rep/pages/p1/visuals/v1/visual.json', visual),
    ]);
    const a = analyzeModel(model!);
    expect(a.fieldParameters.get('fp:KPI Auswahl')!.measures.sort()).toEqual(['Measures[Aufwand_Gesamt]', 'Measures[SQ_Gesamt]', 'Schaden[Schaden_Aufwand]']);
    expect(a.measures.get('Measures[SQ_Gesamt]')!.status).toBe('indirect');
    expect(a.measures.get('Measures[SQ_Gesamt]')!.reason!.root).toMatchObject({ kind: 'visual', fieldParameter: 'fp:KPI Auswahl' });
    expect(a.measures.get('Measures[Aufwand_Gesamt2]')!.status).toBe('unused');
    expect(model!.visuals[0]).toMatchObject({ page: 'Übersicht', pageId: 'p1' });
  });
});
