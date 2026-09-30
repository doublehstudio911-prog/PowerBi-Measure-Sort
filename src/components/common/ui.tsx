import type { ReactNode } from 'react';
import { AlertTriangle, CircleCheck, CircleDot, CircleOff } from 'lucide-react';
import type { UsageLevel, UsageStatus } from '../../types/powerbi';
import { USAGE_DISCLAIMER, USAGE_LEVEL_HELP, USAGE_LEVEL_LABEL, USAGE_LEVEL_TOOLTIP } from '../../utils/reasons';

export function StatusBadge({ status, alsoIndirect }: { status: UsageStatus; alsoIndirect?: boolean }) {
  const map = {
    direct: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', label: 'DIRECT', Icon: CircleCheck },
    indirect: { cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300', label: 'INDIRECT', Icon: CircleDot },
    unused: { cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', label: 'UNUSED', Icon: CircleOff },
  }[status];
  return (
    <span className={`badge ${map.cls}`} title={alsoIndirect ? 'Used directly and also referenced by other used measures' : undefined}>
      <map.Icon size={12} /> {map.label}{alsoIndirect ? ' +' : ''}
    </span>
  );
}

const LEVEL_CLASS: Record<UsageLevel, string> = {
  HIGH: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  MEDIUM: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  LOW: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  NO_OBSERVED_USAGE: 'bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300',
  NO_USAGE_DATA: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

/** Observed-usage class (separate from the technical status). The tooltip explains the classification. */
export function UsageLevelBadge({ level }: { level: UsageLevel }) {
  return (
    <span className={`badge whitespace-nowrap ${LEVEL_CLASS[level]}`} title={`${USAGE_LEVEL_HELP[level]}\n\n${USAGE_LEVEL_TOOLTIP}`}>
      {level}
    </span>
  );
}
export { USAGE_LEVEL_LABEL };

export function FieldParameterBadge({ title }: { title?: string }) {
  return (
    <span className="badge bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300" title={title ?? 'Selectable through a field parameter'}>
      FIELD PARAM
    </span>
  );
}

/** Visible on every screen that shows page-view based numbers. */
export function UsageDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 ${className}`} role="note">
      <span aria-hidden>ⓘ</span>
      <span>{USAGE_DISCLAIMER}</span>
    </div>
  );
}

export function CycleBadge() {
  return (
    <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title="Part of a circular dependency">
      <AlertTriangle size={12} /> CIRCULAR
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-base font-medium text-slate-700 dark:text-slate-200">{title}</div>
      {hint && <div className="max-w-md text-sm text-slate-500 dark:text-slate-400">{hint}</div>}
      {children}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string;
}) {
  return (
    <select className={`input w-auto pr-8 ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Dax({ children, max }: { children: string; max?: number }) {
  return <pre className="code m-0 max-h-72" style={max ? { maxHeight: max } : undefined}>{children || '—'}</pre>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
