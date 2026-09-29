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
