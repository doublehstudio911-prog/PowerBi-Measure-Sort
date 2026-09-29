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
USED     = DIRECT ∪ INDIRECT          UNUSED = ALL − USED
```
* A measure referenced only by unused measures is unused.
* DAX of calculated columns keeps referenced measures alive (they are evaluated regardless of visuals).
* `[Name]` resolves to a measure whenever one exists (conservative – a false "unused" is worse than a false "used"); `Table[Name]` is a column when the table has such a column and no such measure. Comments, strings and `VAR` names are ignored.
* Circular dependencies are detected (Tarjan SCC) and reported as `A → B → C → A`; nothing recurses unboundedly.

## Architecture

```
src/
├── engine/        pure TS, no React – testable on its own
│   ├── daxParser.ts                  tokenizer + [Measure] / Table[Ref] extraction
│   ├── dependencyResolver.ts         measure-vs-column resolution, dependency graph, depths/chains
│   ├── usageAnalyzer.ts              direct / indirect / unused + "reason" paths
│   ├── circularDependencyDetector.ts iterative Tarjan SCC, cycle paths
│   ├── visualResolver.ts             visual field references → model
│   └── analyzeModel.ts               single entry point: ReportModel → AnalysisResult
├── import/        pluggable importers (native JSON, model.bim/TMSL, PBIX report Layout) + registry
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
