import { describe, expect, it } from 'vitest';
import { parseDax } from './daxParser';
import { analyzeModel } from './analyzeModel';
import type { ReportModel } from '../types/powerbi';

describe('DAX parser – NAMEOF', () => {
  it('NAMEOF([Measure A])', () => {
    expect(parseDax('NAMEOF([Measure A])').nameOfRefs).toEqual([{ name: 'Measure A' }]);
  });

  it("NAMEOF('Measure Table'[Measure A])", () => {
    expect(parseDax("NAMEOF('Measure Table'[Measure A])").nameOfRefs).toEqual([{ table: 'Measure Table', name: 'Measure A' }]);
  });

  it('NAMEOF(MeasureTable[Measure A])', () => {
    expect(parseDax('NAMEOF(MeasureTable[Measure A])').nameOfRefs).toEqual([{ table: 'MeasureTable', name: 'Measure A' }]);
  });

  it('handles several NAMEOF calls in a field-parameter constructor', () => {
    const dax = `{
      ("Gesamt", NAMEOF('Measures'[SQ_Gesamt]), 0),
      ("Aufwand", NAMEOF([Aufwand_Gesamt]), 1),
      ("Schaden", NAMEOF(Schaden[Schaden_Aufwand]), 2)
    }`;
    const p = parseDax(dax);
    expect(p.nameOfRefs).toEqual([
      { table: 'Measures', name: 'SQ_Gesamt' }, { name: 'Aufwand_Gesamt' }, { table: 'Schaden', name: 'Schaden_Aufwand' },
    ]);
    expect(p.functions.filter((f) => f === 'NAMEOF')).toHaveLength(3);
  });

  it('de-duplicates repeated references (case-insensitive) and keeps NAMEOF refs in refs', () => {
    const p = parseDax('NAMEOF([A]) + NAMEOF([a]) + [A] + T[A] + T[A]');
    expect(p.nameOfRefs).toEqual([{ name: 'A' }]);
    expect(p.refs).toEqual([{ name: 'A' }, { table: 'T', name: 'A' }]);
  });

  it('ignores NAMEOF inside comments', () => {
    const p = parseDax('// NAMEOF([Hidden])\n/* NAMEOF([Hidden2]) */ -- NAMEOF([Hidden3])\n1');
    expect(p.nameOfRefs).toEqual([]);
    expect(p.refs).toEqual([]);
  });

  it('ignores NAMEOF inside string literals', () => {
    const p = parseDax('"NAMEOF([Hidden])" & "x"');
    expect(p.nameOfRefs).toEqual([]);
    expect(p.refs).toEqual([]);
  });

  it('a call without a reference argument yields nothing', () => {
    expect(parseDax('NAMEOF(1)').nameOfRefs).toEqual([]);
  });

  it('VAR names are still ignored and normal measure references still work', () => {
    const p = parseDax('VAR Revenue = [Revenue] RETURN DIVIDE(Revenue, Sales[Cost]) + CALCULATE([Margin])');
    expect(p.variables).toEqual(['Revenue']);
    expect(p.refs).toEqual([{ name: 'Revenue' }, { table: 'Sales', name: 'Cost' }, { name: 'Margin' }]);
    expect(p.nameOfRefs).toEqual([]);
  });

  it('doubled apostrophes in quoted table names', () => {
    expect(parseDax("NAMEOF('It''s'[A])").nameOfRefs).toEqual([{ table: "It's", name: 'A' }]);
  });

  it('table and column resolution keeps working next to NAMEOF', () => {
    const model: ReportModel = {
      tables: [
        {
          name: 'Sales',
          columns: [{ name: 'Amount' }, { name: 'Margin' }],
          measures: [{ name: 'Total', dax: 'SUM(Sales[Amount]) + Sales[Margin] + [Margin]' }, { name: 'Margin', dax: '1' }],
        },
        { name: 'P', columns: [], measures: [], dax: '{ ("x", NAMEOF([Total]), 0), ("c", NAMEOF(Sales[Amount]), 1) }' },
      ],
      visuals: [],
    };
    const a = analyzeModel(model);
    // Sales[Margin]: the table has a measure of that name → measure (existing rule); Sales[Amount] stays a column
    expect(a.measures.get('Sales[Total]')!.dependsOn).toEqual(['Sales[Margin]']);
    expect(a.measures.get('Sales[Total]')!.usedColumns).toEqual([{ table: 'Sales', column: 'Amount' }]);
    const fp = a.fieldParameters.get('fp:P')!;
    expect(fp.measures).toEqual(['Sales[Total]']);
    expect(fp.columns).toEqual([{ table: 'Sales', column: 'Amount' }]);
  });
});
