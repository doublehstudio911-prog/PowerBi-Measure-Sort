import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteProject, listProjects, loadProject, newId, renameProject, saveProject, toProjectFile } from './projectStore';
import { demoModel } from '../data/demoData';
import { importSource, mergeModels, toSource } from '../import/registry';
import { normalizeModel } from './normalizeModel';
import { analyzeModel } from '../engine';

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

  it('usage metrics, import metadata and column mapping survive save / load and the project file', async () => {
    const id = newId();
    await saveProject({ id, name: 'With usage', model: demoModel });
    const loaded = (await loadProject(id))!.model;
    expect(loaded.usageMetrics).toEqual(demoModel.usageMetrics);
    expect(loaded.usageMeta).toEqual(demoModel.usageMeta);
    expect(loaded.tables.filter((t) => t.dax).map((t) => t.name)).toEqual(['Kennzahl Auswahl', 'Alt Auswahl']);
    expect(analyzeModel(loaded).summary).toEqual(analyzeModel(demoModel).summary);
    await deleteProject(id);

    const out = importSource(toSource('p.json', toProjectFile('X', demoModel)));
    expect(out.result!.model.usageMetrics).toHaveLength(7);
    expect(out.result!.model.usageMeta!.imports[0].mapping.page).toBe('Page name');
    expect(out.result!.model.tables.find((t) => t.name === 'Kennzahl Auswahl')!.dax).toContain('NAMEOF');
    // importing a model file on top keeps the loaded usage data when merged
    const merged = mergeModels({ tables: [], visuals: [] }, out.result!.model);
    expect(merged.usageMetrics).toHaveLength(7);
  });

  it('old saved models without the new optional fields still load (migration defaults)', async () => {
    const legacy = {
      tables: [{ name: 'T', measures: [{ name: 'A', dax: '1' }], columns: [{ name: 'c' }] }, { name: 'Broken' }],
      visuals: [{ id: 'v', page: 'P', name: 'V', type: 'Card', measures: ['[A]'], columns: [], fields: [] }],
    };
    const m = normalizeModel(legacy);
    expect(m.usageMetrics).toBeUndefined();
    expect(m.usageMeta).toBeUndefined();
    expect(m.tables[1]).toEqual({ name: 'Broken', measures: [], columns: [] });
    expect(analyzeModel(m).usage.hasData).toBe(false);
    expect(normalizeModel(null)).toEqual({ tables: [], visuals: [] });
    expect(normalizeModel({ tables: 'x', visuals: 5, usageMetrics: [{ page: '', views: 1 }] })).toEqual({ tables: [], visuals: [] });

    const id = newId();
    await saveProject({ id, name: 'legacy', model: legacy as never });
    expect((await loadProject(id))!.model.tables[1].columns).toEqual([]);
    await deleteProject(id);
  });
});
