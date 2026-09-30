import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyzeModel } from '../engine';
import { demoModel } from '../data/demoData';
import { normalizeModel } from './normalizeModel';
import {
  deleteProject, listProjects, loadProject, newId, renameProject as renameInStore, requestPersistence, saveProject, type ProjectMeta,
} from './projectStore';
import type { AnalysisResult, MeasureId, ReportModel, UsageLevel, UsageStatus, VisualCategory } from '../types/powerbi';

export type View = 'dashboard' | 'measures' | 'dependencies' | 'unused' | 'visuals' | 'tables' | 'usage' | 'projects' | 'import' | 'settings';
export type SaveStatus = 'none' | 'saving' | 'saved' | 'error';
export type Theme = 'light' | 'dark';

export interface Filters {
  status: 'all' | UsageStatus;
  table: string;
  page: string;
  visualType: '' | VisualCategory;
  usageLevel: '' | UsageLevel;
}
export const DEFAULT_FILTERS: Filters = { status: 'all', table: '', page: '', visualType: '', usageLevel: '' };

interface AppState {
  model: ReportModel;
  analysis: AnalysisResult;
  setModel: (m: ReportModel) => void;
  updateModel: (fn: (draft: ReportModel) => ReportModel) => void;
  loadDemo: () => void;
  clearModel: () => void;
  view: View;
  navigate: (v: View) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  query: string;
  setQuery: (q: string) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  selected: MeasureId | null;
  selectMeasure: (id: MeasureId | null) => void;
  /** Saved-project library (IndexedDB) */
  ready: boolean;
  projects: ProjectMeta[];
  currentProject: { id: string; name: string } | null;
  saveStatus: SaveStatus;
  /** Creates a new project from `model` (default: the current one), makes it current. */
  createProject: (name: string, model?: ReportModel) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  /** Detach from the current project (further edits are not saved anywhere) */
  closeProject: () => void;
  removeProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  /** Measure shown in the dependency graph */
  graphFocus: MeasureId | null;
  openInGraph: (id: MeasureId | null) => void;
}

const Ctx = createContext<AppState | null>(null);
const CURRENT_KEY = 'pbi-analyzer:current-project';
/** First app version kept the model in localStorage – migrated to a saved project once. */
const LEGACY_MODEL_KEY = 'pbi-analyzer:model:v1';
const THEME_KEY = 'pbi-analyzer:theme';

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* ignore */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [model, setModelState] = useState<ReportModel>(demoModel);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentProject, setCurrentProject] = useState<{ id: string; name: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('none');
  /** The model object that is already persisted – edits produce a new object, which triggers autosave */
  const persistedModel = useRef<ReportModel | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [query, setQuery] = useState('');
  const [filters, setFiltersState] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<MeasureId | null>(null);
  const [graphFocus, setGraphFocus] = useState<MeasureId | null>(null);

  // Analysis is cached: recomputed only when the model object changes.
  const analysis = useMemo(() => analyzeModel(model), [model]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const refreshProjects = useCallback(async () => {
    try { setProjects(await listProjects()); } catch { /* IndexedDB unavailable */ }
  }, []);

  const markCurrent = (p: { id: string; name: string } | null) => {
    setCurrentProject(p);
    try { if (p) localStorage.setItem(CURRENT_KEY, p.id); else localStorage.removeItem(CURRENT_KEY); } catch { /* ignore */ }
  };

  // Startup: reopen the last project
  useEffect(() => {
    (async () => {
      try {
        await refreshProjects();
        const id = localStorage.getItem(CURRENT_KEY);
        const p = id ? await loadProject(id) : undefined;
        if (p) {
          persistedModel.current = p.model;
          setModelState(p.model);
          setCurrentProject({ id: p.id, name: p.name });
          setSaveStatus('saved');
        } else {
          const legacy = localStorage.getItem(LEGACY_MODEL_KEY);
          if (legacy) {
            const migrated = normalizeModel(JSON.parse(legacy));
            if (migrated.tables.length || migrated.visuals.length) {
              const project = { id: newId(), name: migrated.name || 'Migrated model' };
              await saveProject({ ...project, model: migrated });
              localStorage.removeItem(LEGACY_MODEL_KEY);
              persistedModel.current = migrated;
              setModelState(migrated);
              setCurrentProject(project);
              localStorage.setItem(CURRENT_KEY, project.id);
              setSaveStatus('saved');
              await refreshProjects();
            }
          }
        }
      } catch { /* start with demo data */ }
      setReady(true);
    })();
  }, [refreshProjects]);

  // Autosave: into the current project, or – for hand-entered data – into an automatically created one
  const autoCreating = useRef(false);
  useEffect(() => {
    if (!ready || model === persistedModel.current || model === demoModel) return;
    const empty = model.tables.length === 0 && model.visuals.length === 0;
    if (!currentProject && empty) return;
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try {
        let target = currentProject;
        if (!target) {
          if (autoCreating.current) return;
          autoCreating.current = true;
          target = { id: newId(), name: model.name || 'Untitled project' };
          markCurrent(target);
        }
        requestPersistence();
        await saveProject({ id: target.id, name: target.name, model });
        persistedModel.current = model;
        setSaveStatus('saved');
        await refreshProjects();
      } catch {
        setSaveStatus('error');
      } finally {
        autoCreating.current = false;
      }
    }, 500);
    return () => clearTimeout(t);
  }, [model, ready, currentProject, refreshProjects]);

  const setModel = useCallback((m: ReportModel) => {
    setModelState(m);
    setSelected(null);
    setGraphFocus(null);
    setFiltersState(DEFAULT_FILTERS);
  }, []);
  const updateModel = useCallback((fn: (d: ReportModel) => ReportModel) => setModelState((m) => fn(m)), []);

  const createProject = async (name: string, m: ReportModel = model) => {
    const p = { id: newId(), name: name.trim() || 'Untitled project' };
    setSaveStatus('saving');
    try {
      requestPersistence();
      await saveProject({ ...p, model: m });
      persistedModel.current = m;
      if (m !== model) setModel(m);
      markCurrent(p);
      setSaveStatus('saved');
      await refreshProjects();
    } catch (e) {
      setSaveStatus('error');
      throw e;
    }
  };
  const openProject = async (id: string) => {
    const p = await loadProject(id);
    if (!p) return;
    persistedModel.current = p.model;
    setModel(p.model);
    markCurrent({ id: p.id, name: p.name });
    setSaveStatus('saved');
  };
  const removeProject = async (id: string) => {
    await deleteProject(id);
    if (currentProject?.id === id) { markCurrent(null); setSaveStatus('none'); }
    await refreshProjects();
  };
  const renameProject = async (id: string, name: string) => {
    await renameInStore(id, name);
    if (currentProject?.id === id) markCurrent({ id, name });
    await refreshProjects();
  };

  const value: AppState = {
    ready, projects, currentProject, saveStatus, createProject, openProject, closeProject: () => { markCurrent(null); setSaveStatus('none'); }, removeProject, renameProject,
    model, analysis, setModel, updateModel,
    loadDemo: () => { markCurrent(null); setSaveStatus('none'); setModel(demoModel); },
    clearModel: () => { markCurrent(null); setSaveStatus('none'); setModel({ tables: [], visuals: [] }); },
    view, navigate: (v) => setView(v),
    theme, setTheme: setThemeState,
    query, setQuery,
    filters, setFilters: (f) => setFiltersState((cur) => ({ ...cur, ...f })), resetFilters: () => setFiltersState(DEFAULT_FILTERS),
    selected, selectMeasure: setSelected,
    graphFocus,
    openInGraph: (id) => {
      setGraphFocus(id);
      if (id) setView('dependencies');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
