# Power BI Measure Usage Analyzer

Find out which Power BI measures are really used – including **indirect** usage through other measures – and which ones can be deleted.

```
Page → Visual → SQ_Gesamt → Aufwand_Gesamt → Schaden_Aufwand      (all three are "used")
```

Everything runs **locally in the browser**. No data is sent to any server (the model is kept in `localStorage`).

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (starts with demo data: 10 measures / 7 used / 3 unused)
npm test           # unit tests of the analysis engine + importers
npm run build
```

## Features

Dashboard · Measures (search, filters by status/table/page/visual type) · Unused Measures · interactive Dependency Graph
(React Flow: zoom, pan, click-to-highlight, used-by / depends-on, path from page/visual to measure, focus & full-model mode) ·
Measure detail panel with "why is this used?" · Visuals · Tables (manual entry) · Import · Export (CSV, JSON, Excel) · Dark/Light mode.

## Saved projects
Imports are saved automatically as **projects** (browser IndexedDB) and edits are autosaved. After a restart of the dev server / Codespace open the app and your last project is back; other projects are one click away under **Projects**. Use *Export* / *Open project file* to back up or move a project to another browser (storage is per browser + address).

## Semantics

```
DIRECT   = measures referenced by visuals
INDIRECT = everything reachable from a used measure (recursive, cycle-safe BFS)
USED     = DIRECT ∪ FIELD-PARAMETER MEMBERS ∪ INDIRECT          UNUSED = ALL − USED
```
* **DIRECT** – a visual references the measure. **INDIRECT** – a used measure (or a used field parameter) references it, recursively. **UNUSED** – neither. This *technical* status comes from the PBIP/TMDL/PBIR metadata and answers "where is the measure built in?".
* A measure referenced only by unused measures is unused.
* DAX of calculated columns keeps referenced measures alive (they are evaluated regardless of visuals).
* `[Name]` resolves to a measure whenever one exists (conservative – a false "unused" is worse than a false "used"); `Table[Name]` is a column when the table has such a column and no such measure. Comments, strings and `VAR` names are ignored.
* Circular dependencies are detected (Tarjan SCC) and reported as `A → B → C → A`; nothing recurses unboundedly.

## Field parameters

A Power BI field parameter is a *calculated table* whose DAX lists fields with `NAMEOF`:

```dax
{
    ("Gesamt",  NAMEOF('Measures'[SQ_Gesamt]), 0),
    ("Aufwand", NAMEOF([Aufwand_Gesamt]),      1),
    ("Schaden", NAMEOF(Schaden[Schaden_Aufwand]), 2)
}
```

* The DAX parser reports `NAMEOF([M])`, `NAMEOF('Table'[M])` and `NAMEOF(Table[M])` as `nameOfRefs` (comments and strings are ignored, duplicates removed).
* TMDL (`partition … = calculated` → `source =`), `model.bim`/TMSL (calculated partition), and the Analyzer JSON (`"dax"` on a table) carry the table DAX. Any calculated table with at least one `NAMEOF` is treated as a field parameter.
* **A parameter only counts when a visual uses one of its columns.** Then all measures it lists are technically used and the chain is explained as **Page → Visual → Field Parameter → Measure → Measure …**; their dependencies are INDIRECT. An unused parameter keeps nothing alive – its mere existence is not usage.
* A measure listed in several parameters is de-duplicated; cycles behind a parameter are handled like everywhere else.

## Usage metrics (page views)

Usage metrics are a **second, separate data source**. PBIP/TMDL/PBIR answer *"where is the measure built in?"*, usage metrics answer *"how often was the report page opened?"*.

> **Page views are not DAX executions.** All numbers derived from them (`…Potential`, `ParameterCandidateViews`, HIGH/MEDIUM/LOW) are estimates of *potential reach*. They are **not** the number of times a measure was evaluated and **not** how often a field-parameter entry was selected – that cannot be determined from the metadata.

### Import (CSV, XLSX, XLS)
Import → *Import usage metrics* (or drop a `.csv`/`.xlsx`/`.xls` onto the import area). Columns are detected automatically from normalised headers (case, spaces and punctuation ignored) and can be re-mapped manually. A preview shows the detected columns, sample values, valid/skipped rows and readable validation errors before anything is imported. The import **merges** into the loaded model – tables, measures and visuals are never overwritten. Choose *Replace* or *Add to existing* if usage data is already loaded.

| Field | Recognised headers (`src/import/usageMetrics.ts → USAGE_COLUMN_ALIASES`, easy to extend) |
|---|---|
| report | Report, Report name, ReportName, Bericht, Berichtsname |
| page | Page, Page name, PageName, Report page, ReportPage, Seite, Seitenname |
| pageId *(optional)* | Page ID, PageId, Page key, Section, Section ID, SectionId, Seiten-ID, SeitenId |
| views | Views, View count, ViewCount, Report views, Page views, Aufrufe, Ansichten |
| uniqueUsers *(optional)* | Unique users, UniqueUsers, Viewers, Users, Benutzer, Eindeutige Benutzer |
| date *(optional)* | Date, Activity date, ActivityDate, Datum |

`page` and `views` are required. Views accept `1250`, `1,250`, `1.250`; rows with an empty page or non-numeric/negative/fractional views are skipped and listed. CSV delimiters `, ; TAB |` are detected; for Excel the first sheet with data is used and title rows above the header are skipped.

### Matching usage → page → visuals → measures
1. Rows are matched to report pages by **page id** if the file has one (PBIR page folder / layout section name), otherwise by **normalised name** (trim, collapse whitespace, ignore case). There is **no fuzzy matching**; equal names on several pages are reported as *ambiguous*.
2. If the file contains several reports, rows are matched against the report whose name equals the model name (or the report chosen in the import panel). Rows of other reports are listed as unmatched.
3. Unmatched rows are collected separately and shown on Import and Dashboard.
4. Multiple date rows of the same page are summed; the page is listed once.

Per measure (`AnalysisResult.usage.measures`):

| Field | Meaning |
|---|---|
| `directVisualCount` | visuals referencing the measure directly (every visual counts) |
| `indirectVisualCount` | visuals reaching it through ≥ 1 other measure |
| `fieldParameterVisualCount` | visuals offering it as selectable field of a used field parameter |
| `pageViewsPotential` | views of all **distinct** matched pages where the measure is technically reachable |
| `directPageViewsPotential` | views of pages where a visual references it directly |
| `indirectPageViewsPotential` | views of pages where it is reachable **only** through measure dependencies |
| `parameterCandidateViews` | views of pages where it is selectable via a field parameter – *candidate* usage; every member of the parameter gets the full page views |
| `uniqueUsersPotential` | sum of the pages' unique users, **not de-duplicated** (no user ids) – never an organisation-wide unique count |
| `matchedPages` | distinct reachable pages that have usage rows |

**No double counting:** a page's views are counted once per measure and page, regardless of how many visuals, parameters or dependency paths lead there (`directVisualCount` still counts every visual; reason paths can list all visuals).

### Usage status (separate from the technical status)
| Status | Meaning |
|---|---|
| `NO_USAGE_DATA` | no usage metrics imported |
| `NO_OBSERVED_USAGE` | usage data loaded, but no views on the pages where the measure is reachable. A technically **used** measure with this status is *not* unused – it is `USED + NO_OBSERVED_USAGE` |
| `HIGH` / `MEDIUM` / `LOW` | relative, no absolute thresholds: measures with `pageViewsPotential > 0` are ranked by **mid-rank percentile** – top third = HIGH, middle third = MEDIUM, bottom third = LOW. Ties share a rank, so identical values are classified identically (all equal → MEDIUM); a single measure is MEDIUM |

The same explanation is available as tooltip on the usage badges.

## Persistence, backup and reset
* Projects (model, **usage metrics, import metadata and column mapping, field-parameter DAX**) are stored in the browser's **IndexedDB** (large models exceed the `localStorage` quota); `localStorage` only holds the theme and the id of the last opened project. Edits are autosaved; the analysis result is **not** stored – it is recomputed on load (cached in memory), so nothing derivable is stored twice.
* Older saved projects and the very first `localStorage` model format are migrated on load (missing fields get defaults).
* **Export project file** (Projects page) is the manual backup; **Open project file** restores it – including usage data.
* **Remove usage metrics** (Import page / Settings) deletes only the usage data – tables, measures and visuals stay. **Reset entire project** (Settings) empties the working model including usage metrics and detaches it from the saved project.

## Privacy
All parsing and analysis (PBIP, TMDL, PBIR, CSV, Excel) runs **locally in the browser**. No imported data is sent to any server; the app makes no network requests with your data.

## Export
* **CSV / Excel** – per measure. The original columns (`Measure, Table, Status, DirectUsage, IndirectUsage, UsedBy, DependsOn, Circular, DAX`; `Status` = technical status) are unchanged; appended: `TechnicalStatus, UsageStatus, DirectVisualCount, IndirectVisualCount, FieldParameterVisualCount, PageViewsPotential, DirectPageViewsPotential, IndirectPageViewsPotential, ParameterCandidateViews, UniqueUsersPotential_NotDeduplicated, MatchedPages, FieldParameters, UsageReason, TechnicalReasonPath`. Excel adds sheets `Unused`, `Visuals`, `MatchedPages`, `UnmatchedUsage`, `FieldParameters`.
* **JSON** – complete structure incl. `fieldParameters`, per-measure `usage`, and `usageMetrics` (matched pages, unmatched rows, distribution).

Extended Analyzer JSON (import format; `dax` on a table = calculated table, `usageMetrics`/`usageMeta` optional):

```json
{
  "name": "Sales report",
  "tables": [
    { "name": "Measures", "measures": [ { "name": "SQ_Gesamt", "dax": "DIVIDE([Aufwand], [ABGP])" } ] },
    { "name": "KPI Auswahl", "columns": [ { "name": "KPI Auswahl" } ],
      "dax": "{ (\"Gesamt\", NAMEOF('Measures'[SQ_Gesamt]), 0) }" }
  ],
  "visuals": [
    { "page": "Overview", "pageId": "ReportSection1", "name": "KPI chart", "type": "Chart",
      "measures": [], "columns": [ "'KPI Auswahl'[KPI Auswahl]" ] }
  ],
  "usageMetrics": [
    { "report": "Sales report", "page": "Overview", "views": 500, "uniqueUsers": 120, "date": "2026-03-01" }
  ]
}
```

## Architecture

```
src/
├── engine/        pure TS, no React – testable on its own
│   ├── daxParser.ts                  tokenizer + [Measure] / Table[Ref] extraction
│   ├── dependencyResolver.ts         measure-vs-column resolution, dependency graph, depths/chains
│   ├── usageAnalyzer.ts              direct / indirect / unused + "reason" paths
│   ├── circularDependencyDetector.ts iterative Tarjan SCC, cycle paths
│   ├── visualResolver.ts             visual field references → model
│   ├── usageMetricsResolver.ts       usage rows → pages → visuals → measures (potential reach, usage status)
│   └── analyzeModel.ts               single entry point: ReportModel → AnalysisResult
├── import/        pluggable importers (native JSON, model.bim/TMSL, TMDL, PBIR, PBIX Layout, project file) + registry
│                  usageMetrics.ts: CSV/Excel usage-metrics reader, column mapping, validation (own flow: needs a mapping preview)
├── types/powerbi.ts   input model + analysis result types
├── data/demoData.ts
├── state/  utils/  components/   UI
```

### Import formats
| Format | Content |
|---|---|
| Analyzer JSON | `{ tables:[{name, measures:[{name,dax}], columns}], visuals:[{page,name,type,measures}] }` |
| `model.bim` / TMSL | tables, columns, measures, calculated columns |
| **TMDL** (`definition/tables/*.tmdl`) | tables, columns, measures, calculated columns (PBIP semantic model) |
| **PBIR** (`definition/pages/*/page.json`, `visuals/*/visual.json`) | pages, visuals and every field used – incl. sort, filters and conditional formatting (PBIP report) |
| PBIX `Report/Layout` | pages, visuals, used fields |

Use **Select PBIP folder** to load a whole `*.SemanticModel` / `*.Report` folder in one go. Or select several files at once (e.g. `model.bim` + `Layout`) – they are merged. To add a real Power BI import (PBIP, XMLA endpoint, Fabric REST, …) implement `ReportImporter` (`src/import/types.ts`) and register it in `src/import/registry.ts`; the engine stays untouched.
