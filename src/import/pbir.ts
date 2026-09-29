import type { Visual } from '../types/powerbi';
import { collectFieldRefs } from './pbiFields';
import type { ImportResult, ImportSource, ReportImporter } from './types';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

const pageIdOf = (fileName: string) => /(?:^|[\\/])pages[\\/]([^\\/]+)[\\/]/i.exec(fileName)?.[1];

/** PBIR `definition/pages/<page>/visuals/<visual>/visual.json` */
export const pbirVisualImporter: ReportImporter = {
  id: 'pbir-visual',
  label: 'PBIR visual (visual.json)',
  description: 'One visual of a PBIP report (definition/pages/*/visuals/*/visual.json). Select the whole report "definition" folder to get all pages and visuals.',
  detect: (src: ImportSource) => isObj(src.json) && isObj((src.json as Obj).visual) && typeof (src.json as Obj).visual.visualType === 'string',
  parse(src): ImportResult {
    const j = src.json as Obj;
    const page = pageIdOf(src.fileName) ?? 'Page';
    const refs = collectFieldRefs(j);
    const title = j.visual?.visualContainerObjects?.title?.[0]?.properties?.text?.expr?.Literal?.Value;
    const id = String(j.name ?? src.fileName);
    const visual: Visual = {
      id: `${page}/${id}`,
      page,
      name: typeof title === 'string' ? title.replace(/^'|'$/g, '') : `${j.visual.visualType} ${id.slice(0, 6)}`,
      type: String(j.visual.visualType),
      measures: refs.measures,
      columns: refs.columns,
      fields: [],
    };
    return { model: { tables: [], visuals: [visual] }, notes: [`${visual.type}: ${refs.measures.length} measure(s), ${refs.columns.length} column(s)`] };
  },
};

/** PBIR `pages/<page>/page.json` – only used to give pages their display name. */
export const pbirPageImporter: ReportImporter = {
  id: 'pbir-page',
  label: 'PBIR page (page.json)',
  description: 'Provides the display name of a report page.',
  detect: (src: ImportSource) =>
    isObj(src.json) && typeof (src.json as Obj).displayName === 'string' && typeof (src.json as Obj).name === 'string' && /(^|[\\/])page\.json$/i.test(src.fileName),
  parse(src): ImportResult {
    const j = src.json as Obj;
    const id = pageIdOf(src.fileName) ?? String(j.name);
    return { model: { tables: [], visuals: [] }, pageNames: { [id]: String(j.displayName) }, notes: [`Page “${j.displayName}”`] };
  },
};
