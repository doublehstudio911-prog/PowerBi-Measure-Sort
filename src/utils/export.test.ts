import { describe, expect, it } from 'vitest';
import { analyzeModel } from '../engine';
import { demoModel } from '../data/demoData';
import { toCsv, toJson } from './export';

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
});
