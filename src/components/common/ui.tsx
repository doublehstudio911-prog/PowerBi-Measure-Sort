import type { ReactNode } from 'react';
import { AlertTriangle, CircleCheck, CircleDot, CircleOff } from 'lucide-react';
import type { UsageStatus } from '../../types/powerbi';

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
