import { describe, expect, it } from 'vitest';
import { importSource, mergeModels, toSource } from './registry';
import { analyzeModel } from '../engine';

const spec = {
  tables: [{ name: 'Sales', measures: [{ name: 'Revenue', dax: 'SUM(Sales[Amount])' }, { name: 'Margin', dax: '[Revenue] - [Cost]' }, { name: 'Cost', dax: '1' }] }],
  visuals: [{ page: 'Overview', name: 'Revenue Card', type: 'Card', measures: ['[Revenue]'] }],
};

describe('importers', () => {
  it('imports the JSON example from the spec', () => {
    const out = importSource(toSource('a.json', JSON.stringify(spec)));
    expect(out.importer?.id).toBe('native-json');
    const a = analyzeModel(out.result!.model);
    expect(a.measures.get('Sales[Revenue]')!.status).toBe('direct');
    expect(a.measures.get('Sales[Margin]')!.status).toBe('unused');
  });

  it('imports model.bim + report layout and merges them', () => {
    const bim = { name: 'M', model: { tables: [
      { name: 'Sales', columns: [{ name: 'Amount' }, { name: 'Dbl', type: 'calculated', expression: ['[Cost]', '* 2'] }],
        measures: [{ name: 'Revenue', expression: ['SUM(Sales[Amount])'] }, { name: 'Cost', expression: 'SUM(Sales[Amount])' }, { name: 'Gone', expression: '1' }] },
      { name: 'LocalDateTable_123', columns: [], measures: [] },
    ] } };
    const layout = { sections: [{ displayName: 'Overview', visualContainers: [
      { config: JSON.stringify({ name: 'abc', singleVisual: { visualType: 'card', prototypeQuery: {
        From: [{ Name: 's', Entity: 'Sales' }],
        Select: [{ Measure: { Expression: { SourceRef: { Source: 's' } }, Property: 'Revenue' }, Name: 'Sales.Revenue' },
                 { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: 's' } }, Property: 'Amount' } }, Function: 0 } }] } } }) },
      { config: JSON.stringify({ name: 'shape' }) },
    ] }] };
    const o1 = importSource(toSource('model.bim', JSON.stringify(bim)));
    const o2 = importSource(toSource('Layout', JSON.stringify(layout)));
    expect(o1.importer?.id).toBe('tmsl-bim');
    expect(o2.importer?.id).toBe('report-layout');
    const merged = mergeModels(o1.result!.model, o2.result!.model);
    expect(merged.tables.map((t) => t.name)).toEqual(['Sales']);
    const a = analyzeModel(merged);
    expect(a.visuals.get('abc')!.measures).toEqual(['Sales[Revenue]']);
    expect(a.visuals.get('abc')!.columns).toEqual([{ table: 'Sales', column: 'Amount' }]);
    expect(a.measures.get('Sales[Revenue]')!.status).toBe('direct');
    expect(a.measures.get('Sales[Cost]')!.status).toBe('indirect'); // via calculated column
    expect(a.measures.get('Sales[Gone]')!.status).toBe('unused');
  });

  it('reports errors for unknown / invalid files', () => {
    expect(importSource(toSource('x.txt', 'hello')).error).toMatch(/JSON/);
    expect(importSource(toSource('x.json', '{"foo":1}')).error).toMatch(/Unknown/);
  });
});

describe('importers – calculated tables and page ids', () => {
  it('TMSL/BIM: a calculated-table partition becomes the table DAX', () => {
    const bim = { model: { tables: [
      { name: 'P', columns: [{ name: 'P' }], partitions: [{ name: 'P', source: { type: 'calculated', expression: ['{', '  ("a", NAMEOF([A]), 0)', '}'] } }] },
      { name: 'S', partitions: [{ name: 'S', source: { type: 'm', expression: 'let x = 1 in x' } }], measures: [{ name: 'A', expression: '1' }] },
    ] } };
    const out = importSource(toSource('model.bim', JSON.stringify(bim)));
    const [p, s] = out.result!.model.tables;
    expect(p.dax).toBe('{\n  ("a", NAMEOF([A]), 0)\n}');
    expect(s.dax).toBeUndefined();
    expect('dax' in s).toBe(false);
  });

  it('native JSON keeps table dax and visual pageId', () => {
    const json = { tables: [{ name: 'P', dax: '{ ("a", NAMEOF([A]), 0) }' }, { name: 'S', measures: [{ name: 'A', dax: '1' }] }], visuals: [{ page: 'Seite', pageId: 'sec1', name: 'v', type: 'Card', columns: ['P[P]'] }] };
    const m = importSource(toSource('a.json', JSON.stringify(json))).result!.model;
    expect(m.tables[0].dax).toBe('{ ("a", NAMEOF([A]), 0) }');
    expect(m.visuals[0].pageId).toBe('sec1');
    expect(analyzeModel(m).measures.get('S[A]')!.status).toBe('indirect');
  });

  it('report layout: section name is the page id, displayName the page', () => {
    const layout = { sections: [{ name: 'ReportSection7', displayName: 'Übersicht', visualContainers: [
      { config: JSON.stringify({ name: 'x', singleVisual: { visualType: 'card', prototypeQuery: { From: [{ Name: 's', Entity: 'T' }], Select: [{ Measure: { Expression: { SourceRef: { Source: 's' } }, Property: 'A' } }] } } }) },
    ] }] };
    const v = importSource(toSource('Layout', JSON.stringify(layout))).result!.model.visuals[0];
    expect(v).toMatchObject({ page: 'Übersicht', pageId: 'ReportSection7', measures: ['T[A]'] });
  });
});

describe('field reference formatting', () => {
  it('quotes table names that are not plain identifiers and escapes brackets/quotes', async () => {
    const { formatFieldRef } = await import('./pbiFields');
    expect(formatFieldRef('Sales', 'Revenue')).toBe('Sales[Revenue]');
    expect(formatFieldRef('KPI Auswahl', 'KPI Auswahl')).toBe("'KPI Auswahl'[KPI Auswahl]");
    expect(formatFieldRef("It's", 'A')).toBe("'It''s'[A]");
    expect(formatFieldRef('Größe', 'A')).toBe('Größe[A]');
    expect(formatFieldRef(undefined, 'A]B')).toBe('[A]]B]');
  });
});
