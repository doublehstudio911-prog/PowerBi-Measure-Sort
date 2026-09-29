import type { ReportModel, Visual } from '../types/powerbi';
import { collectFieldRefs } from './pbiFields';
import type { ImportResult, ImportSource, ReportImporter } from './types';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

function maybeParse(x: unknown): Obj | null {
  if (isObj(x)) return x;
  if (typeof x === 'string') {
    try {
      const p = JSON.parse(x);
      return isObj(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Legacy PBIX `Report/Layout` JSON (sections → visualContainers → config). */
export const reportLayoutImporter: ReportImporter = {
  id: 'report-layout',
  label: 'Report layout (PBIX Report/Layout)',
  description: 'Pages, visuals and the fields they use, from the Layout JSON of an extracted .pbix. Contains no DAX – combine with a model.bim.',
  detect: (src: ImportSource) => isObj(src.json) && Array.isArray((src.json as Obj).sections),
  parse(src): ImportResult {
    const root = src.json as Obj;
    const visuals: Visual[] = [];
    const notes: string[] = [];
    for (const section of root.sections as Obj[]) {
      const page = String(section.displayName ?? section.name ?? 'Page');
      let n = 0;
      for (const vc of (section.visualContainers ?? []) as Obj[]) {
        const config = maybeParse(vc.config);
        const sv = config?.singleVisual;
        if (!sv) continue; // groups, shapes without query
        const query = sv.prototypeQuery ?? maybeParse(vc.query)?.Commands?.[0]?.SemanticQueryDataShapeCommand?.Query;
        const aliases = new Map<string, string>((query?.From ?? []).map((f: Obj) => [f.Name, f.Entity]));
        const { measures, columns } = collectFieldRefs(sv, aliases);
        const title = sv.vcObjects?.title?.[0]?.properties?.text?.expr?.Literal?.Value;
        const id = String(config.name ?? `${page}#${n}`);
        visuals.push({
          id,
          page,
          name: typeof title === 'string' ? title.replace(/^'|'$/g, '') : `${sv.visualType ?? 'visual'} ${++n}`,
          type: String(sv.visualType ?? 'Other'),
          measures,
          columns,
          fields: [],
        });
      }
    }
    if (!visuals.length) notes.push('No visuals with a query found.');
    const model: ReportModel = { tables: [], visuals };
    return { model, notes: [`${(root.sections as unknown[]).length} pages, ${visuals.length} visuals`, ...notes] };
  },
};
