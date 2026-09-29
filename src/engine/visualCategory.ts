import type { VisualCategory } from '../types/powerbi';

export const VISUAL_CATEGORIES: VisualCategory[] = ['Card', 'Table', 'Matrix', 'Chart', 'Slicer', 'KPI', 'Other'];

/** Maps Power BI visual type ids / display names to a coarse category used for filtering. */
export function categorizeVisualType(type: string): VisualCategory {
  const t = (type ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (!t) return 'Other';
  if (t.includes('slicer')) return 'Slicer';
  if (t === 'kpi' || t.includes('kpi') || t === 'gauge') return 'KPI';
  if (t.includes('matrix') || t.includes('pivottable')) return 'Matrix';
  if (t.includes('card')) return 'Card';
  if (t === 'table' || t === 'tableex' || t.includes('tablevisual')) return 'Table';
  if (/(chart|bar|column|line|area|pie|donut|scatter|waterfall|treemap|funnel|ribbon|map|combo)/.test(t)) return 'Chart';
  return 'Other';
}
