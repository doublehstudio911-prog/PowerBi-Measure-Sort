import { describe, expect, it } from 'vitest';
import { analyzeModel, getDependencyTree, getUsedByTree } from './analyzeModel';
import { parseDax } from './daxParser';
import { detectCycles, formatCycle } from './circularDependencyDetector';
import { demoModel } from '../data/demoData';
import type { ReportModel, Visual } from '../types/powerbi';

const vis = (name: string, measures: string[], extra: Partial<Visual> = {}): Visual => ({
  id: name, page: 'P', name, type: 'Card', measures, columns: [], fields: [], ...extra,
});
const mk = (tables: Record<string, Record<string, string>>, visuals: Visual[], columns: Record<string, string[]> = {}): ReportModel => ({
  tables: Object.entries(tables).map(([name, ms]) => ({
    name,
    columns: (columns[name] ?? []).map((c) => ({ name: c })),
    measures: Object.entries(ms).map(([n, dax]) => ({ name: n, dax })),
  })),
  visuals,
});
const status = (m: ReportModel, id: string) => analyzeModel(m).measures.get(id)!.status;
const unused = (m: ReportModel) => [...analyzeModel(m).measures.values()].filter((x) => x.status === 'unused').map((x) => x.name).sort();

describe('DAX parser', () => {
  it('extracts [M], Table[M] and \'Quoted Table\'[M]', () => {
    const p = parseDax("[A] + Sales[B] + 'My Table'[C] + 'It''s'[D]");
    expect(p.refs).toEqual([{ name: 'A' }, { table: 'Sales', name: 'B' }, { table: 'My Table', name: 'C' }, { table: "It's", name: 'D' }]);
  });
  it('ignores comments and string literals', () => {
    const p = parseDax('[A] // [B]\n + /* [C] */ 1 + LEN("[D] and ""[E]""") -- [F]\n + [G]');
    expect(p.refs.map((r) => r.name)).toEqual(['A', 'G']);
  });
  it('handles escaped closing brackets in names', () => {
    expect(parseDax('[Sales [%]]] + 1').refs[0].name).toBe('Sales [%]');
  });
  it('does not treat RETURN/VAR keywords as table qualifiers', () => {
    const p = parseDax('VAR x = 1 RETURN[Revenue]');
    expect(p.refs).toEqual([{ name: 'Revenue' }]);
    expect(p.variables).toEqual(['x']);
  });
  it('strips a matching "Name =" header, keeps a non-matching comparison', () => {
    expect(parseDax('SQ =\nDIVIDE([A],[B])', { selfName: 'SQ' }).refs.map((r) => r.name)).toEqual(['A', 'B']);
    expect(parseDax('[SQ] = DIVIDE([A],[B])', { selfName: 'SQ' }).refs.map((r) => r.name)).toEqual(['A', 'B']);
    expect(parseDax('[A] = [B]', { selfName: 'X' }).refs.map((r) => r.name)).toEqual(['A', 'B']);
  });
});

describe('usage analysis', () => {
  it('demo data: 10 total / 7 used / 3 unused', () => {
    const a = analyzeModel(demoModel);
    expect(a.summary.totalMeasures).toBe(10);
    expect(a.summary.usedMeasures).toBe(7);
    expect(a.summary.unusedMeasures).toBe(3);
    expect(unused(demoModel)).toEqual(['Altes_Measure', 'Debug_Measure', 'Test_Measure']);
    expect(a.cycles).toHaveLength(0);
    expect(a.warnings).toHaveLength(0);
  });

  it('direct usage', () => {
    const m = mk({ T: { A: 'SUM(T[x])', B: '1' } }, [vis('v', ['[A]'])]);
    const a = analyzeModel(m).measures.get('T[A]')!;
    expect(a.status).toBe('direct');
    expect(a.directVisuals).toEqual(['v']);
    expect(status(m, 'T[B]')).toBe('unused');
  });

  it('indirect usage over several levels (and demo reason chain)', () => {
    const a = analyzeModel(demoModel);
    expect(a.measures.get('KPI[SQ_Gesamt]')!.status).toBe('direct');
    expect(a.measures.get('Finance[Aufwand_Gesamt]')!.status).toBe('indirect');
    const sa = a.measures.get('Claims[Schaden_Aufwand]')!;
    expect(sa.status).toBe('indirect');
    expect(sa.reason!.chain).toEqual(['KPI[SQ_Gesamt]', 'Finance[Aufwand_Gesamt]', 'Claims[Schaden_Aufwand]']);
    expect(sa.reason!.root).toEqual({ kind: 'visual', visualId: 'v1' });
    expect(sa.indirectVisuals).toEqual(['v1']);
    expect(a.measures.get('KPI[SQ_Gesamt]')!.depth).toBe(3);
    expect(a.longestChains[0].path).toEqual(['KPI[Altes_Measure]', 'KPI[SQ_Gesamt]', 'Finance[Aufwand_Gesamt]', 'Claims[Schaden_Aufwand]']);
  });

  it('cross-table dependencies (KPI → Claims → Finance)', () => {
    const m = mk(
      { KPI: { 'Loss Ratio': 'DIVIDE(Claims[Claims Amount], 1)' }, Claims: { 'Claims Amount': '[Expense] * 2' }, Finance: { Expense: 'SUM(Finance[x])' } },
      [vis('v', ['KPI[Loss Ratio]'])],
    );
    expect(status(m, 'Finance[Expense]')).toBe('indirect');
    expect(unused(m)).toEqual([]);
  });

  it('unused measure referencing used measures stays unused; unused chain stays unused', () => {
    const m = mk({ T: { Used: '1', Old: '[Used] + 1', Older: '[Old]' } }, [vis('v', ['[Used]'])]);
    expect(unused(m)).toEqual(['Old', 'Older']);
    // References count ≠ usage
    expect(analyzeModel(m).measures.get('T[Old]')!.usedByMeasures).toEqual(['T[Older]']);
  });

  it('measure used by several measures / visuals gets correct counts', () => {
    const m = mk(
      { T: { Base: '1', A: '[Base]', B: '[Base]', C: '[Base] + [A]' } },
      [vis('v1', ['[A]']), vis('v2', ['[B]']), vis('v3', ['[C]'])],
    );
    const base = analyzeModel(m).measures.get('T[Base]')!;
    expect(base.usedByMeasures.sort()).toEqual(['T[A]', 'T[B]', 'T[C]']);
    expect(base.indirectMeasureUsages).toBe(3);
    expect(base.indirectVisuals.sort()).toEqual(['v1', 'v2', 'v3']);
    expect(base.directVisuals).toEqual([]);
    expect(base.status).toBe('indirect');
  });

  it('measure used directly AND indirectly is DIRECT with isIndirect flag', () => {
    const m = mk({ T: { A: '[B]', B: '1' } }, [vis('v1', ['[A]']), vis('v2', ['[B]'])]);
    const b = analyzeModel(m).measures.get('T[B]')!;
    expect(b.status).toBe('direct');
    expect(b.isIndirect).toBe(true);
  });

  it('measure appearing nowhere is unused, with zero references', () => {
    const b = analyzeModel(demoModel).measures.get('Claims[Test_Measure]')!;
    expect(b.status).toBe('unused');
    expect(b.usedByMeasures).toEqual(['Finance[Debug_Measure]']);
    const a = analyzeModel(demoModel).measures.get('Finance[Debug_Measure]')!;
    expect(a.usedByMeasures).toEqual([]);
    expect(a.allVisuals).toEqual([]);
  });

  it('unused list contains exactly the unreachable measures (invariant on random-ish model)', () => {
    const tables: Record<string, string> = {};
    for (let i = 0; i < 200; i++) tables[`M${i}`] = i % 3 === 0 && i + 1 < 200 ? `[M${i + 1}] + [M${(i * 7) % 200}]` : '1';
    const m = mk({ T: tables }, [vis('v', ['[M0]'])]);
    const a = analyzeModel(m);
    // independent reachability check (naive DFS)
    const seen = new Set<string>();
    const dfs = (n: string) => { if (seen.has(n)) return; seen.add(n); a.measures.get(n)!.dependsOn.forEach(dfs); };
    dfs('T[M0]');
    for (const x of a.measures.values()) expect(x.isUsed).toBe(seen.has(x.id));
    expect(a.summary.usedMeasures + a.summary.unusedMeasures).toBe(200);
  });

  it('calculated columns keep referenced measures alive', () => {
    const m: ReportModel = {
      tables: [{ name: 'T', measures: [{ name: 'A', dax: '1' }, { name: 'B', dax: '2' }], columns: [{ name: 'c', calculated: true, dax: '[A] * 2' }] }],
      visuals: [],
    };
    expect(status(m, 'T[A]')).toBe('indirect');
    expect(analyzeModel(m).measures.get('T[A]')!.reason!.root).toEqual({ kind: 'column', column: 'T[c]' });
    expect(status(m, 'T[B]')).toBe('unused');
  });
});

describe('false positives', () => {
  it('similar names are not confused', () => {
    const m = mk({ T: { Revenue: '1', 'Revenue YTD': '2', Rev: '3', Revenue2: '[Revenue YTD]' } }, [vis('v', ['[Revenue2]'])]);
    expect(unused(m).sort()).toEqual(['Rev', 'Revenue']);
    expect(status(m, 'T[Revenue YTD]')).toBe('indirect');
  });

  it('variables are not measures', () => {
    // `Revenue` the variable must not create a dependency on a *different* measure called Revenue via bare identifier
    const m = mk({ T: { Revenue: '1', Other: 'VAR Revenue = 5 RETURN Revenue * 2', Wrap: 'VAR X = [Revenue] RETURN X' } }, [vis('v', ['[Other]'])]);
    const a = analyzeModel(m);
    expect(a.measures.get('T[Other]')!.dependsOn).toEqual([]);
    expect(status(m, 'T[Revenue]')).toBe('unused'); // only used by unused "Wrap"
    expect(a.measures.get('T[Wrap]')!.dependsOn).toEqual(['T[Revenue]']);
  });

  it('a VAR table variable\'s column reference is not a measure', () => {
    const m = mk({ T: { Revenue: '1', A: 'VAR t = FILTER(ALL(S), 1) RETURN SUMX(t, t[Revenue])' } }, [vis('v', ['[A]'])], { S: ['Revenue'] });
    expect(analyzeModel(m).measures.get('T[A]')!.dependsOn).toEqual([]);
  });

  it('columns are not measures: Table[Col] resolves to the column even if a measure has the same name elsewhere', () => {
    const m = mk(
      { Sales: { Total: 'SUM(Sales[Revenue])' }, KPI: { Revenue: 'SUM(Other[x])' } },
      [vis('v', ['[Total]'])],
      { Sales: ['Revenue'] },
    );
    const a = analyzeModel(m);
    expect(a.measures.get('Sales[Total]')!.dependsOn).toEqual([]);
    expect(a.measures.get('Sales[Total]')!.usedColumns).toEqual([{ table: 'Sales', column: 'Revenue' }]);
    expect(status(m, 'KPI[Revenue]')).toBe('unused');
  });

  it('unqualified [Name] is a measure when one exists, qualified column stays a column', () => {
    const m = mk({ Sales: { Revenue: '1', Calc: '[Revenue] + Sales[Revenue]' } }, [vis('v', ['[Calc]'])], { Sales: ['Revenue'] });
    // Sales has both a measure and column named Revenue in this (invalid but tolerated) model → measure wins
    expect(analyzeModel(m).measures.get('Sales[Calc]')!.dependsOn).toEqual(['Sales[Revenue]']);
  });

  it('references inside strings/comments do not count', () => {
    const m = mk({ T: { A: '1', B: '"[A]" & "x" // [A]\n /* [A] */' } }, [vis('v', ['[B]'])]);
    expect(unused(m)).toEqual(['A']);
  });

  it('DAX with a "Name =" header works', () => {
    const m = mk({ T: { SQ: 'SQ =\nDIVIDE([Aufwand], [ABGP])', Aufwand: '1', ABGP: '1' } }, [vis('v', ['[SQ]'])]);
    expect(unused(m)).toEqual([]);
  });

  it('supported function contexts', () => {
    const m = mk(
      { T: { M1: '1', M2: '1', M3: '1', M4: '1', M5: '1', Top: 'CALCULATE([M1]) + SUMX(T, [M2]) + COUNTROWS(FILTER(T, [M3] > 0)) + IF([M4] > 10, DIVIDE([M5], 2), 0)' } },
      [vis('v', ['[Top]'])],
    );
    expect(unused(m)).toEqual([]);
  });

  it('quoted table qualifiers and umlauts', () => {
    const m = mk({ 'Meine Tabelle': { Größe: '1', Top: "'Meine Tabelle'[Größe] * 2" } }, [vis('v', ["'Meine Tabelle'[Top]"])]);
    expect(unused(m)).toEqual([]);
  });
});

describe('circular dependencies', () => {
  it('detects A → B → C → A without hanging, and still computes usage', () => {
    const m = mk({ T: { A: '[B]', B: '[C]', C: '[A] + [D]', D: '1', E: '1' } }, [vis('v', ['[A]'])]);
    const a = analyzeModel(m);
    expect(a.cycles).toHaveLength(1);
    expect(formatCycle(a.cycles[0], (x) => x.slice(2, -1))).toBe('A → B → C → A');
    expect(a.cycles[0].members).toEqual(['T[A]', 'T[B]', 'T[C]']);
    expect(a.measures.get('T[B]')!.inCycle).toBe(true);
    expect(a.measures.get('T[D]')!.inCycle).toBe(false);
    expect(unused(m)).toEqual(['E']);
    expect(a.measures.get('T[D]')!.status).toBe('indirect');
  });

  it('self reference is a cycle', () => {
    const m = mk({ T: { A: '[A] + 1' } }, [vis('v', ['[A]'])]);
    const a = analyzeModel(m);
    expect(a.cycles[0].path).toEqual(['T[A]']);
  });

  it('cycle among unused measures is reported and they remain unused', () => {
    const m = mk({ T: { A: '[B]', B: '[A]', U: '1' } }, [vis('v', ['[U]'])]);
    const a = analyzeModel(m);
    expect(a.cycles).toHaveLength(1);
    expect(unused(m)).toEqual(['A', 'B']);
  });

  it('trees are finite on cycles', () => {
    const m = mk({ T: { A: '[B]', B: '[A]' } }, [vis('v', ['[A]'])]);
    const a = analyzeModel(m);
    const t = getDependencyTree(a, 'T[A]');
    expect(t.children[0].children[0].truncated).toBe('cycle');
    expect(getUsedByTree(a, 'T[A]').children[0].children[0].truncated).toBe('cycle');
  });

  it('very deep chain (2000) does not overflow the stack', { timeout: 20000 }, () => {
    const ms: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) ms[`M${i}`] = i < 1999 ? `[M${i + 1}]` : '1';
    const a = analyzeModel(mk({ T: ms }, [vis('v', ['[M0]'])]));
    expect(a.summary.unusedMeasures).toBe(0);
    expect(a.measures.get('T[M0]')!.depth).toBe(2000);
  });

  it('detectCycles works on raw graphs', () => {
    const g = new Map([['a', ['b']], ['b', ['a']], ['c', []]]);
    expect(detectCycles(['a', 'b', 'c'], g)).toHaveLength(1);
  });
});

describe('visuals', () => {
  it('resolves several reference notations and reports unknown measures', () => {
    const m = mk({ Sales: { Rev: '1', Cost: '1' } }, [
      vis('v', ['[Rev]', "'Sales'[Cost]", 'Missing'], { columns: ['Sales[Amount]'], fields: ['Sales.Rev'] }),
    ]);
    const a = analyzeModel(m);
    const v = a.visuals.get('v')!;
    expect(v.measures.sort()).toEqual(['Sales[Cost]', 'Sales[Rev]']);
    expect(v.unresolved).toEqual(['Missing']);
    expect(v.columns).toEqual([{ table: 'Sales', column: 'Amount' }]);
    expect(a.warnings.some((w) => w.kind === 'unresolved-visual-field')).toBe(true);
  });

  it('visual reachable measures include the whole chain', () => {
    const a = analyzeModel(demoModel);
    expect(a.visuals.get('v1')!.reachableMeasures.sort()).toEqual(
      ['Claims[Schaden_Aufwand]', 'Finance[ABGP_Gesamt]', 'Finance[Aufwand_Gesamt]', 'KPI[SQ_Gesamt]'],
    );
  });

  it('categorizes visual types', () => {
    const a = analyzeModel(demoModel);
    expect(a.visuals.get('v6')!.category).toBe('Chart');
    expect(a.visuals.get('v5')!.category).toBe('Table');
    expect(a.visuals.get('v3')!.category).toBe('Slicer');
  });
});

describe('performance', () => {
  it('1,200 measures / 120 tables / 3,000 visuals analyse quickly', { timeout: 20000 }, () => {
    const tables: Record<string, Record<string, string>> = {};
    for (let t = 0; t < 120; t++) {
      tables[`Table${t}`] = {};
      for (let i = 0; i < 10; i++) {
        const n = t * 10 + i;
        tables[`Table${t}`][`M${n}`] = n % 5 === 0 ? 'SUM(Table0[x])' : `[M${n - (n % 5)}] + [M${(n * 13) % (n || 1)}]`;
      }
    }
    const visuals = Array.from({ length: 3000 }, (_, i) => vis(`v${i}`, [`[M${(i * 7) % 1200}]`], { page: `Page ${i % 30}` }));
    const t0 = performance.now();
    const a = analyzeModel(mk(tables, visuals));
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(a.summary.totalMeasures).toBe(1200);
    expect(a.summary.usedMeasures + a.summary.unusedMeasures).toBe(1200);
  });
});
