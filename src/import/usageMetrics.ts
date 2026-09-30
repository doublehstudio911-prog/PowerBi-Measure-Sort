import type { UsageField, UsageMapping, UsageMetric, UsageMetricsMeta } from '../types/powerbi';

/**
 * Usage-metrics import (Power BI "Usage Metrics" exports as CSV / XLSX / XLS).
 *
 * Deliberately NOT a `ReportImporter`: those turn one text file into model structure. A usage export needs a
 * header → field mapping step with preview and is combined with the already loaded model. Everything runs in the
 * browser; the file content never leaves it.
 */

// ───────────────────────── Column aliases (central, easy to extend) ─────────────────────────

export const USAGE_FIELDS: UsageField[] = ['report', 'page', 'pageId', 'views', 'uniqueUsers', 'date'];

export const USAGE_FIELD_LABELS: Record<UsageField, string> = {
  report: 'Report',
  page: 'Page',
  pageId: 'Page ID (optional)',
  views: 'Views',
  uniqueUsers: 'Unique users (optional)',
  date: 'Date (optional)',
};

/** Known header variants per logical field. Matching ignores case, spaces and punctuation. */
export const USAGE_COLUMN_ALIASES: Record<UsageField, string[]> = {
  report: ['Report', 'Report name', 'ReportName', 'Bericht', 'Berichtsname'],
  page: ['Page', 'Page name', 'PageName', 'Report page', 'ReportPage', 'Seite', 'Seitenname'],
  pageId: ['Page ID', 'PageId', 'Page key', 'Section', 'Section ID', 'SectionId', 'Seiten-ID', 'SeitenId'],
  views: ['Views', 'View count', 'ViewCount', 'Report views', 'Page views', 'Aufrufe', 'Ansichten'],
  uniqueUsers: ['Unique users', 'UniqueUsers', 'Viewers', 'Users', 'Benutzer', 'Eindeutige Benutzer'],
  date: ['Date', 'Activity date', 'ActivityDate', 'Datum'],
};

export const normalizeHeader = (s: string): string => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Automatic column detection: exact match of the normalized header against the alias list. Each header is used once. */
export function detectMapping(headers: string[]): UsageMapping {
  const mapping: UsageMapping = {};
  const taken = new Set<number>();
  for (const field of USAGE_FIELDS) {
    for (const alias of USAGE_COLUMN_ALIASES[field]) {
      const key = normalizeHeader(alias);
      const idx = headers.findIndex((h, i) => !taken.has(i) && normalizeHeader(h) === key);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        taken.add(idx);
        break;
      }
    }
  }
  return mapping;
}

// ───────────────────────── Reading files ─────────────────────────

export type UsageCell = string | number | Date | null | undefined;

export interface RawTable {
  fileName: string;
  format: 'csv' | 'xlsx' | 'xls';
  sheetName?: string;
  headers: string[];
  rows: UsageCell[][];
}

export const isUsageFileName = (name: string) => /\.(csv|xlsx|xls)$/i.test(name);

/** Delimiter detection on the first non-empty line, ignoring quoted parts. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 CSV parser (quotes, escaped quotes, line breaks inside quotes). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const isBlank = (c: UsageCell) => c === null || c === undefined || (typeof c === 'string' && c.trim() === '');

/** First row with ≥ 2 filled cells is the header (skips title rows); falls back to the first non-empty row. */
function splitHeader(matrix: UsageCell[][]): { headers: string[]; rows: UsageCell[][] } {
  const filled = (r: UsageCell[]) => r.filter((c) => !isBlank(c)).length;
  let h = matrix.findIndex((r) => filled(r) >= 2);
  if (h === -1) h = matrix.findIndex((r) => filled(r) >= 1);
  if (h === -1) return { headers: [], rows: [] };
  const headers = matrix[h].map((c, i) => (isBlank(c) ? `Column ${i + 1}` : String(c).trim()));
  return { headers, rows: matrix.slice(h + 1) };
}

export type UsageFileData = string | ArrayBuffer | Uint8Array;

/** Reads a CSV or Excel file into a raw table. Throws an Error with a readable message on unreadable input. */
export async function readUsageTable(fileName: string, data: UsageFileData): Promise<RawTable> {
  const extMatch = /\.(csv|xlsx|xls)$/i.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') throw new Error('Unsupported file type – use CSV, XLSX or XLS.');

  if (ext === 'csv') {
    const text = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data);
    const { headers, rows } = splitHeader(parseCsv(text));
    if (!headers.length) throw new Error('The file contains no data.');
    return { fileName, format: 'csv', headers, rows };
  }

  if (typeof data === 'string') throw new Error('Excel files must be read as binary data.');
  // SheetJS silently parses arbitrary bytes as text – check the container signature first (xlsx = ZIP "PK", xls = OLE2)
  const head = new Uint8Array(data instanceof Uint8Array ? data.subarray(0, 4) : data.slice(0, 4));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (!isZip && !isOle) throw new Error('The Excel file could not be read. Is it damaged, password protected or not really an Excel file?');
  const XLSX = await import('xlsx');
  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(data, { type: 'array', cellDates: true });
  } catch {
    throw new Error('The Excel file could not be read. Is it damaged or password protected?');
  }
  // first sheet that has data
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<UsageCell[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
    const { headers, rows } = splitHeader(matrix);
    if (headers.length) return { fileName, format: ext, sheetName, headers, rows };
  }
  throw new Error('The workbook contains no data.');
}

// ───────────────────────── Value parsing ─────────────────────────

/** Parses a non-negative integer count. Understands "1250", "1,250", "1.250", "1 250" and Excel numbers. */
export function parseCount(v: UsageCell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && Number.isInteger(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\s  ]/g, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+[.,]0+$/.test(s)) return Number(s.replace(/[.,]0+$/, ''));
  return null;
}

/** ISO date (YYYY-MM-DD) for dates, Excel serials, ISO, dd.mm.yyyy and m/d/yyyy strings; otherwise the trimmed text. */
export function toIsoDate(v: UsageCell): string | undefined {
  if (isBlank(v)) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  if (typeof v === 'number') {
    return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) : String(v);
  }
  const s = String(v).trim();
  const pad = (n: string) => n.padStart(2, '0');
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    // m/d/yyyy (US); if the first number cannot be a month the text is d/m/yyyy
    const [month, day] = Number(m[1]) > 12 ? [m[2], m[1]] : [m[1], m[2]];
    return `${m[3]}-${pad(month)}-${pad(day)}`;
  }
  return s;
}

const text = (v: UsageCell): string => (isBlank(v) ? '' : v instanceof Date ? (toIsoDate(v) ?? '') : String(v).trim());

// ───────────────────────── Extraction & validation ─────────────────────────

export interface SkippedRow {
  /** 1-based row number in the file (header row = 1 for tables starting in the first row) */
  row: number;
  reason: string;
}

export interface ColumnPreview {
  header: string;
  /** field the header is mapped to, if any */
  field?: UsageField;
  samples: string[];
}

export interface UsageExtraction {
  metrics: UsageMetric[];
  validRows: number;
  skipped: SkippedRow[];
  blankRows: number;
  /** Fatal problems – nothing can be imported */
  errors: string[];
  /** Non-fatal hints (e.g. ignored unique-user values) */
  warnings: string[];
  columns: ColumnPreview[];
}

export function extractUsageMetrics(table: RawTable, mapping: UsageMapping): UsageExtraction {
  const errors: string[] = [];
  const warnings: string[] = [];
  const skipped: SkippedRow[] = [];
  const metrics: UsageMetric[] = [];
  let blankRows = 0;

  const indexOf = (field: UsageField): number => {
    const header = mapping[field];
    return header === undefined ? -1 : table.headers.indexOf(header);
  };
  const idx: Record<UsageField, number> = {
    report: indexOf('report'), page: indexOf('page'), pageId: indexOf('pageId'),
    views: indexOf('views'), uniqueUsers: indexOf('uniqueUsers'), date: indexOf('date'),
  };

  for (const field of USAGE_FIELDS) {
    if (mapping[field] !== undefined && idx[field] === -1) errors.push(`Mapped column "${mapping[field]}" for ${field} does not exist in the file.`);
  }
  if (idx.page === -1) errors.push('No page column found. Map a column to "Page" manually.');
  if (idx.views === -1) errors.push('No views column found. Map a column to "Views" manually.');
  const used = USAGE_FIELDS.filter((f) => idx[f] !== -1).map((f) => table.headers[idx[f]]);
  if (new Set(used).size !== used.length) errors.push('The same column is mapped to more than one field.');

  const columns: ColumnPreview[] = table.headers.map((header, i) => ({
    header,
    field: USAGE_FIELDS.find((f) => idx[f] === i),
    samples: table.rows.map((r) => text(r[i])).filter(Boolean).slice(0, 3),
  }));

  if (errors.length === 0) {
    let badUsers = 0;
    table.rows.forEach((r, n) => {
      const rowNumber = n + 2;
      if (r.every(isBlank)) { blankRows++; return; }
      const page = text(r[idx.page]);
      if (!page) { skipped.push({ row: rowNumber, reason: 'Page name is empty' }); return; }
      const rawViews = r[idx.views];
      if (isBlank(rawViews)) { skipped.push({ row: rowNumber, reason: 'Views value is missing' }); return; }
      const views = parseCount(rawViews);
      if (views === null) { skipped.push({ row: rowNumber, reason: `Views is not a non-negative whole number: "${text(rawViews)}"` }); return; }

      const metric: UsageMetric = { page, views };
      const report = idx.report !== -1 ? text(r[idx.report]) : '';
      if (report) metric.report = report;
      const pageId = idx.pageId !== -1 ? text(r[idx.pageId]) : '';
      if (pageId) metric.pageId = pageId;
      if (idx.uniqueUsers !== -1 && !isBlank(r[idx.uniqueUsers])) {
        const users = parseCount(r[idx.uniqueUsers]);
        if (users === null) badUsers++; else metric.uniqueUsers = users;
      }
      const date = idx.date !== -1 ? toIsoDate(r[idx.date]) : undefined;
      if (date) metric.date = date;
      metrics.push(metric);
    });
    if (badUsers) warnings.push(`${badUsers} unique-user value(s) were not valid numbers and were ignored.`);
    if (metrics.length === 0) errors.push('No valid rows found.');
  }

  return { metrics, validRows: metrics.length, skipped, blankRows, errors, warnings, columns };
}

// ───────────────────────── Merging into the model ─────────────────────────

export function newImportId(): string {
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Combines an extraction with existing usage data. `replace` drops earlier imports, `append` keeps them. Inputs are not mutated. */
export function mergeUsage(
  existing: { usageMetrics?: UsageMetric[]; usageMeta?: UsageMetricsMeta },
  table: RawTable,
  mapping: UsageMapping,
  extraction: UsageExtraction,
  mode: 'replace' | 'append',
  now: Date = new Date(),
): { usageMetrics: UsageMetric[]; usageMeta: UsageMetricsMeta } {
  const previous = mode === 'append' ? existing : {};
  return {
    usageMetrics: [...(previous.usageMetrics ?? []), ...extraction.metrics],
    usageMeta: {
      reportFilter: previous.usageMeta?.reportFilter,
      imports: [
        ...(previous.usageMeta?.imports ?? []),
        {
          id: newImportId(),
          fileName: table.fileName,
          format: table.format,
          importedAt: now.toISOString(),
          mapping: { ...mapping },
          validRows: extraction.validRows,
          skippedRows: extraction.skipped.length,
        },
      ],
    },
  };
}

/** Removes usage data only; tables, measures and visuals stay untouched. */
export function withoutUsage<T extends { usageMetrics?: UsageMetric[]; usageMeta?: UsageMetricsMeta }>(model: T): Omit<T, 'usageMetrics' | 'usageMeta'> {
  const { usageMetrics: _metrics, usageMeta: _meta, ...rest } = model;
  return rest;
}

/** Defensive normalisation of persisted / imported usage data (unknown shapes from older versions or hand-edited files). */
export function normalizeUsageMetrics(raw: unknown): UsageMetric[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: UsageMetric[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    const views = parseCount(typeof o.views === 'number' || typeof o.views === 'string' ? o.views : null);
    if (typeof o.page !== 'string' || !o.page.trim() || views === null) continue;
    const m: UsageMetric = { page: o.page, views };
    if (typeof o.report === 'string' && o.report.trim()) m.report = o.report;
    if (typeof o.pageId === 'string' && o.pageId.trim()) m.pageId = o.pageId;
    const users = typeof o.uniqueUsers === 'number' || typeof o.uniqueUsers === 'string' ? parseCount(o.uniqueUsers) : null;
    if (users !== null) m.uniqueUsers = users;
    if (typeof o.date === 'string' && o.date.trim()) m.date = o.date;
    out.push(m);
  }
  return out;
}

export function normalizeUsageMeta(raw: unknown): UsageMetricsMeta | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const imports = Array.isArray(o.imports)
    ? o.imports.filter((i): i is UsageMetricsMeta['imports'][number] => typeof i === 'object' && i !== null && typeof (i as { fileName?: unknown }).fileName === 'string')
    : [];
  return { imports, reportFilter: typeof o.reportFilter === 'string' && o.reportFilter ? o.reportFilter : undefined };
}
