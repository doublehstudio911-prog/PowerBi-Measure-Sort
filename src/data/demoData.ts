import type { ReportModel } from '../types/powerbi';

/**
 * Demo model: 10 measures, 7 used, 3 deliberately unused – plus field parameters and usage metrics.
 *
 *   Schadenübersicht  → SQ KPI → SQ_Gesamt → Aufwand_Gesamt → Schaden_Aufwand
 *                                          ↘ ABGP_Gesamt
 *   Vertragsübersicht → Kennzahl Slicer/Chart → Field Parameter "Kennzahl Auswahl"
 *                                          → Schadenzahl · ABGP_Gesamt · Vertrag_Aktiv   (only used via the parameter)
 *   Archiv            → JNP KPI → JNP → ABGP_Gesamt, Vertrag_Aktiv                        (page has 0 observed views)
 *
 *   Field parameter "Alt Auswahl" (Test_Measure, Debug_Measure) is used by no visual → keeps nothing alive.
 *   Usage rows: three pages with views, one page without views, one unknown page, one row of another report.
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
    {
      // Field parameter (used by two visuals): all three measures are selectable in "Kennzahl nach Sparte"
      name: 'Kennzahl Auswahl',
      columns: [{ name: 'Kennzahl Auswahl' }, { name: 'Kennzahl Auswahl Fields' }, { name: 'Kennzahl Auswahl Order' }],
      measures: [],
      dax: `{
    ("Schadenzahl", NAMEOF('Claims'[Schadenzahl]), 0),
    ("ABGP", NAMEOF([ABGP_Gesamt]), 1),
    ("Aktive Verträge", NAMEOF(Contracts[Vertrag_Aktiv]), 2)
}`,
    },
    {
      // Field parameter that no visual uses: its measures are NOT kept alive
      name: 'Alt Auswahl',
      columns: [{ name: 'Alt Auswahl' }, { name: 'Alt Auswahl Fields' }, { name: 'Alt Auswahl Order' }],
      measures: [],
      dax: `{
    ("Test", NAMEOF([Test_Measure]), 0),
    ("Debug", NAMEOF('Finance'[Debug_Measure]), 1)
}`,
    },
  ],
  visuals: [
    { id: 'v1', page: 'Schadenübersicht', pageId: 'page-schaden', name: 'SQ KPI', type: 'KPI', measures: ['[SQ_Gesamt]'], columns: [], fields: [] },
    { id: 'v2', page: 'Vertragsübersicht', pageId: 'page-vertrag', name: 'Kennzahl Slicer', type: 'Slicer', measures: [], columns: ["'Kennzahl Auswahl'[Kennzahl Auswahl]"], fields: [] },
    { id: 'v3', page: 'Schadenübersicht', pageId: 'page-schaden', name: 'Sparte Slicer', type: 'Slicer', measures: [], columns: ['Contracts[Sparte]'], fields: [] },
    { id: 'v4', page: 'Archiv', pageId: 'page-archiv', name: 'JNP KPI', type: 'KPI', measures: ['[JNP]'], columns: [], fields: [] },
    { id: 'v5', page: 'Vertragsübersicht', pageId: 'page-vertrag', name: 'Vertragsliste', type: 'Table', measures: [], columns: ['Contracts[Vertrag_ID]', 'Contracts[Status]'], fields: [] },
    { id: 'v6', page: 'Vertragsübersicht', pageId: 'page-vertrag', name: 'Kennzahl nach Sparte', type: 'Clustered Column Chart', measures: [], columns: ["'Kennzahl Auswahl'[Kennzahl Auswahl]", 'Contracts[Sparte]'], fields: [] },
  ],
  usageMetrics: [
    { report: 'Demo – Schaden & Vertrag', page: 'Schadenübersicht', views: 500, uniqueUsers: 120, date: '2026-03-01' },
    { report: 'Demo – Schaden & Vertrag', page: 'Schadenübersicht', views: 450, uniqueUsers: 110, date: '2026-03-02' },
    { report: 'Demo – Schaden & Vertrag', page: 'Schadenübersicht', views: 300, uniqueUsers: 90, date: '2026-03-03' },
    { report: 'Demo – Schaden & Vertrag', page: 'Vertragsübersicht', views: 340, uniqueUsers: 80, date: '2026-03-01' },
    { report: 'Demo – Schaden & Vertrag', page: 'Archiv', views: 0, uniqueUsers: 0, date: '2026-03-01' },
    { report: 'Demo – Schaden & Vertrag', page: 'Alte Seite', views: 90, uniqueUsers: 25, date: '2026-03-01' },
    { report: 'Anderer Bericht', page: 'Übersicht', views: 500, uniqueUsers: 140, date: '2026-03-01' },
  ],
  usageMeta: {
    imports: [
      {
        id: 'demo-usage',
        fileName: 'demo-usage-metrics.csv',
        format: 'csv',
        importedAt: '2026-03-04T08:00:00.000Z',
        mapping: { report: 'Report name', page: 'Page name', views: 'Views', uniqueUsers: 'Unique users', date: 'Date' },
        validRows: 7,
        skippedRows: 0,
      },
    ],
  },
};
