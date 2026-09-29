import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { analyzeModel } from '../engine';
import { demoModel } from '../data/demoData';
import type { AnalysisResult, MeasureId, ReportModel, UsageStatus, VisualCategory } from '../types/powerbi';

export type View = 'dashboard' | 'measures' | 'dependencies' | 'unused' | 'visuals' | 'tables' | 'import' | 'settings';
export type Theme = 'light' | 'dark';

export interface Filters {
  status: 'all' | UsageStatus;
  table: string;
  page: string;
  visualType: '' | VisualCategory;
}
export const DEFAULT_FILTERS: Filters = { status: 'all', table: '', page: '', visualType: '' };

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
  /** Measure shown in the dependency graph */
  graphFocus: MeasureId | null;
  openInGraph: (id: MeasureId | null) => void;
}

const Ctx = createContext<AppState | null>(null);
const MODEL_KEY = 'pbi-analyzer:model:v1';
const THEME_KEY = 'pbi-analyzer:theme';

function loadModel(): ReportModel {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (raw) {
      const m = JSON.parse(raw) as ReportModel;
      if (Array.isArray(m.tables) && Array.isArray(m.visuals)) return m;
    }
  } catch {
    /* ignore corrupt / unavailable storage */
  }
  return demoModel;
}

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* ignore */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [model, setModelState] = useState<ReportModel>(loadModel);
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

  useEffect(() => {
    // Local only – nothing ever leaves the browser.
    const t = setTimeout(() => {
      try { localStorage.setItem(MODEL_KEY, JSON.stringify(model)); } catch { /* quota / private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [model]);

  const setModel = useCallback((m: ReportModel) => {
    setModelState(m);
    setSelected(null);
    setGraphFocus(null);
    setFiltersState(DEFAULT_FILTERS);
  }, []);
  const updateModel = useCallback((fn: (d: ReportModel) => ReportModel) => setModelState((m) => fn(m)), []);

  const value: AppState = {
    model, analysis, setModel, updateModel,
    loadDemo: () => setModel(demoModel),
    clearModel: () => setModel({ tables: [], visuals: [] }),
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
