import { FilterX } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { VISUAL_CATEGORIES } from '../../engine';
import { Select } from '../common/ui';

export function FilterBar({ showStatus = true }: { showStatus?: boolean }) {
  const { analysis, filters, setFilters, resetFilters, query, setQuery } = useApp();
  const dirty = filters.status !== 'all' || filters.table || filters.page || filters.visualType || query;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showStatus && (
        <Select
          value={filters.status}
          onChange={(v) => setFilters({ status: v as typeof filters.status })}
          options={[
            { value: 'all', label: 'Status: All' },
            { value: 'direct', label: 'Directly used' },
            { value: 'indirect', label: 'Indirectly used' },
            { value: 'unused', label: 'Unused' },
          ]}
        />
      )}
      <Select value={filters.table} onChange={(v) => setFilters({ table: v })} placeholder="All tables" options={[...analysis.tables.keys()].sort().map((t) => ({ value: t, label: t }))} />
      <Select value={filters.page} onChange={(v) => setFilters({ page: v })} placeholder="All pages" options={analysis.pages.map((p) => ({ value: p, label: p }))} />
      <Select value={filters.visualType} onChange={(v) => setFilters({ visualType: v as typeof filters.visualType })} placeholder="All visual types" options={VISUAL_CATEGORIES.map((c) => ({ value: c, label: c }))} />
      {dirty && (
        <button className="btn" onClick={() => { resetFilters(); setQuery(''); }}><FilterX size={14} /> Reset</button>
      )}
    </div>
  );
}
