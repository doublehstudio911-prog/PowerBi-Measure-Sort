import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteProject, listProjects, loadProject, newId, renameProject, saveProject, toProjectFile } from './projectStore';
import { demoModel } from '../data/demoData';
import { importSource, toSource } from '../import/registry';

describe('project store', () => {
  it('saves, lists, loads, renames and deletes projects', async () => {
    const id = newId();
    const meta = await saveProject({ id, name: 'Demo', model: demoModel });
    expect(meta.measures).toBe(10);
    expect((await listProjects()).map((p) => p.name)).toContain('Demo');
    expect((await loadProject(id))!.model.visuals).toHaveLength(6);
    await renameProject(id, 'Renamed');
    expect((await loadProject(id))!.name).toBe('Renamed');
    const first = (await loadProject(id))!.createdAt;
    await saveProject({ id, name: 'Renamed', model: { tables: [], visuals: [] } });
    expect((await loadProject(id))!.createdAt).toBe(first); // update keeps creation date
    await deleteProject(id);
    expect(await loadProject(id)).toBeUndefined();
  });

  it('project file round-trips including visuals', () => {
    const out = importSource(toSource('p.json', toProjectFile('X', demoModel)));
    expect(out.importer?.id).toBe('project-file');
    expect(out.result!.model.visuals).toHaveLength(6);
    expect(out.result!.model.tables.reduce((a, t) => a + t.measures.length, 0)).toBe(10);
  });
});
