import type { ReportModel } from '../types/powerbi';

/**
 * Local project library on top of IndexedDB (no size problems like localStorage, survives
 * restarts of the dev server / Codespace as long as the browser origin stays the same).
 * Two stores: `meta` (small, for listing) and `models` (the heavy payload).
 */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  savedAt: number;
  tables: number;
  measures: number;
  visuals: number;
}
export interface Project extends ProjectMeta { model: ReportModel }

const DB = 'pbi-measure-analyzer';
const META = 'meta';
const MODELS = 'models';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'id' });
      req.result.createObjectStore(MODELS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

const wrap = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function statsOf(model: ReportModel) {
  return { tables: model.tables.length, measures: model.tables.reduce((a, t) => a + t.measures.length, 0), visuals: model.visuals.length };
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const d = await db();
  const all = await wrap<ProjectMeta[]>(d.transaction(META).objectStore(META).getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const d = await db();
  const tx = d.transaction([META, MODELS]);
  const [meta, model] = await Promise.all([wrap<ProjectMeta | undefined>(tx.objectStore(META).get(id)), wrap<ReportModel | undefined>(tx.objectStore(MODELS).get(id))]);
  return meta && model ? { ...meta, model } : undefined;
}

/** Creates or updates. `createdAt` is preserved for existing projects. */
export async function saveProject(p: { id: string; name: string; model: ReportModel }): Promise<ProjectMeta> {
  const d = await db();
  const tx = d.transaction([META, MODELS], 'readwrite');
  const existing = await wrap<ProjectMeta | undefined>(tx.objectStore(META).get(p.id));
  const now = Date.now();
  const meta: ProjectMeta = { id: p.id, name: p.name, createdAt: existing?.createdAt ?? now, savedAt: now, ...statsOf(p.model) };
  tx.objectStore(META).put(meta);
  tx.objectStore(MODELS).put(p.model, p.id);
  await done(tx);
  return meta;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(META, 'readwrite');
  const meta = await wrap<ProjectMeta | undefined>(tx.objectStore(META).get(id));
  if (meta) tx.objectStore(META).put({ ...meta, name });
  await done(tx);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction([META, MODELS], 'readwrite');
  tx.objectStore(META).delete(id);
  tx.objectStore(MODELS).delete(id);
  await done(tx);
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export function requestPersistence() {
  try { void navigator.storage?.persist?.(); } catch { /* ignore */ }
}

// ───────────────────────── Project file (export / import) ─────────────────────────

export const PROJECT_FORMAT = 'pbi-measure-analyzer-project';

export function toProjectFile(name: string, model: ReportModel): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: 1, name, savedAt: new Date().toISOString(), model }, null, 2);
}
