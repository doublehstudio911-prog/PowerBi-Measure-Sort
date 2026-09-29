import type { ReportModel } from '../types/powerbi';

/**
 * Demo model: 10 measures, 7 used (2 directly via visuals, the rest through dependency chains),
 * 3 deliberately unused. Also demonstrates cross-table references, VARs and column-vs-measure names.
 *
 *   SQ KPI  → SQ_Gesamt → Aufwand_Gesamt → Schaden_Aufwand
 *                       ↘ ABGP_Gesamt
 *   JNP KPI → JNP → ABGP_Gesamt, Vertrag_Aktiv
 */
export const demoModel: ReportModel = {
  name: 'Demo – Schaden & Vertrag',
  tables: [
    {
      name: 'KPI',
      columns: [],
      measures: [
        {
          name: 'SQ_Gesamt',
          dax: 'DIVIDE(\n    [Aufwand_Gesamt],\n    [ABGP_Gesamt]\n)',
          lastModified: '2025-03-14',
        },
        {
          name: 'JNP',
          dax: 'VAR Abgp = [ABGP_Gesamt]\nVAR Aktiv = [Vertrag_Aktiv]\nRETURN\n    DIVIDE(Abgp, Aktiv)',
          lastModified: '2025-02-02',
        },
        {
          name: 'Altes_Measure',
          dax: '// Vorgänger von SQ_Gesamt – nicht mehr verwendet\nCALCULATE([SQ_Gesamt], Contracts[Status] = "Aktiv") * 1',
          lastModified: '2022-11-30',
        },
      ],
    },
    {
      name: 'Claims',
      columns: [{ name: 'Schadenzahl' }, { name: 'Aufwand' }, { name: 'Schaden_ID' }],
      measures: [
        { name: 'Schaden_Aufwand', dax: 'SUM(Claims[Aufwand])', lastModified: '2025-01-20' },
        // Column "Schadenzahl" has the same name as the measure – must not be confused
        { name: 'Schadenzahl', dax: 'DISTINCTCOUNT(Claims[Schaden_ID])', lastModified: '2025-01-20' },
        { name: 'Test_Measure', dax: 'COUNTROWS(Claims) + SUM(Claims[Schadenzahl])', lastModified: '2024-06-06' },
      ],
    },
    {
      name: 'Finance',
      columns: [{ name: 'ABGP' }, { name: 'Datum' }],
      measures: [
        { name: 'Aufwand_Gesamt', dax: 'SUMX(\n    Contracts,\n    [Schaden_Aufwand]\n)', lastModified: '2025-03-01' },
        { name: 'ABGP_Gesamt', dax: 'SUM(Finance[ABGP])', lastModified: '2025-03-01' },
        { name: 'Debug_Measure', dax: '"Debug: " & FORMAT([Test_Measure], "0")', lastModified: '2024-06-06' },
      ],
    },
    {
      name: 'Contracts',
      columns: [{ name: 'Vertrag_ID' }, { name: 'Status' }, { name: 'Sparte' }],
      measures: [
        { name: 'Vertrag_Aktiv', dax: "CALCULATE(DISTINCTCOUNT(Contracts[Vertrag_ID]), Contracts[Status] = \"Aktiv\")", lastModified: '2025-02-10' },
      ],
    },
  ],
  visuals: [
    { id: 'v1', page: 'Schadenübersicht', name: 'SQ KPI', type: 'KPI', measures: ['[SQ_Gesamt]'], columns: [], fields: [] },
    { id: 'v2', page: 'Schadenübersicht', name: 'Schadenzahl Card', type: 'Card', measures: ['Claims[Schadenzahl]'], columns: [], fields: [] },
    { id: 'v3', page: 'Schadenübersicht', name: 'Sparte Slicer', type: 'Slicer', measures: [], columns: ['Contracts[Sparte]'], fields: [] },
    { id: 'v4', page: 'Vertragsübersicht', name: 'JNP KPI', type: 'KPI', measures: ['[JNP]'], columns: [], fields: [] },
    { id: 'v5', page: 'Vertragsübersicht', name: 'Vertragsliste', type: 'Table', measures: [], columns: ['Contracts[Vertrag_ID]', 'Contracts[Status]'], fields: [] },
    { id: 'v6', page: 'Vertragsübersicht', name: 'Schaden nach Sparte', type: 'Clustered Column Chart', measures: ['Claims[Schadenzahl]'], columns: ['Contracts[Sparte]'], fields: [] },
  ],
};
