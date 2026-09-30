import { describe, expect, it } from 'vitest';
import {
  detectMapping, extractUsageMetrics, mergeUsage, normalizeHeader, normalizeUsageMetrics, parseCount, parseCsv, readUsageTable, toIsoDate,
  withoutUsage,
} from './usageMetrics';
import { analyzeModel } from '../engine';
import { demoModel } from '../data/demoData';

const csv = (text: string, name = 'usage.csv') => readUsageTable(name, text);

describe('usage metrics import – CSV', () => {
  it('standard columns are detected automatically', async () => {
    const t = await csv('Report,Page,Views,Unique users,Date\nSales,Overview,120,30,2026-01-01\nSales,Details,80,20,2026-01-01\n');
    expect(detectMapping(t.headers)).toEqual({ report: 'Report', page: 'Page', views: 'Views', uniqueUsers: 'Unique users', date: 'Date' });
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    expect(x.errors).toEqual([]);
    expect(x.metrics).toEqual([
      { report: 'Sales', page: 'Overview', views: 120, uniqueUsers: 30, date: '2026-01-01' },
      { report: 'Sales', page: 'Details', views: 80, uniqueUsers: 20, date: '2026-01-01' },
    ]);
    expect(x.validRows).toBe(2);
  });

  it('German column names, semicolon delimiter, dd.mm.yyyy dates and BOM', async () => {
    const t = await csv('﻿Berichtsname;Seitenname;Aufrufe;Eindeutige Benutzer;Datum\nVertrieb;Übersicht;"1.250";40;03.02.2026\n');
    expect(detectMapping(t.headers)).toEqual({ report: 'Berichtsname', page: 'Seitenname', views: 'Aufrufe', uniqueUsers: 'Eindeutige Benutzer', date: 'Datum' });
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    expect(x.metrics).toEqual([{ report: 'Vertrieb', page: 'Übersicht', views: 1250, uniqueUsers: 40, date: '2026-02-03' }]);
  });

  it('alternative English names (case, spaces and punctuation are ignored)', async () => {
    const t = await csv('  report NAME ,PageName,View count,Viewers,activity_date, Page ID\nR,P,5,2,2026-05-05,abc\n');
    expect(detectMapping(t.headers)).toEqual({
      report: 'report NAME', page: 'PageName', pageId: 'Page ID', views: 'View count', uniqueUsers: 'Viewers', date: 'activity_date',
    });
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    expect(x.metrics[0]).toMatchObject({ page: 'P', pageId: 'abc', views: 5 });
    expect(normalizeHeader(' Seiten-ID ')).toBe('seitenid');
  });

  it('invalid views and empty page names are skipped with readable reasons', async () => {
    const t = await csv('Page,Views\nA,10\nB,abc\nC,-3\nD,12.5\n,7\nE,\nF,"1,250"\n\n');
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    expect(x.metrics.map((m) => [m.page, m.views])).toEqual([['A', 10], ['F', 1250]]);
    expect(x.skipped.map((s) => s.row)).toEqual([3, 4, 5, 6, 7]);
    expect(x.skipped[0].reason).toMatch(/not a non-negative whole number: "abc"/);
    expect(x.skipped[3].reason).toMatch(/Page name is empty/);
    expect(x.skipped[4].reason).toMatch(/missing/);
    expect(x.errors).toEqual([]);
  });

  it('unknown columns are ignored but shown in the preview with samples', async () => {
    const t = await csv('Page,Views,Comment,Owner\nA,1,hello,x\nB,2,world,y\n');
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    expect(x.errors).toEqual([]);
    expect(x.columns.map((c) => [c.header, c.field])).toEqual([['Page', 'page'], ['Views', 'views'], ['Comment', undefined], ['Owner', undefined]]);
    expect(x.columns[2].samples).toEqual(['hello', 'world']);
  });

  it('manual mapping fixes files without recognisable headers; missing required columns are reported', async () => {
    const t = await csv('Foo,Bar,Baz\nOverview,10,x\nDetails,5,y\n');
    expect(detectMapping(t.headers)).toEqual({});
    const bad = extractUsageMetrics(t, {});
    expect(bad.errors).toEqual(['No page column found. Map a column to "Page" manually.', 'No views column found. Map a column to "Views" manually.']);
    expect(bad.metrics).toEqual([]);
    const ok = extractUsageMetrics(t, { page: 'Foo', views: 'Bar' });
    expect(ok.errors).toEqual([]);
    expect(ok.metrics.map((m) => [m.page, m.views])).toEqual([['Overview', 10], ['Details', 5]]);
    // same column twice / unknown column
    expect(extractUsageMetrics(t, { page: 'Foo', views: 'Foo' }).errors).toContain('The same column is mapped to more than one field.');
    expect(extractUsageMetrics(t, { page: 'Foo', views: 'Nope' }).errors[0]).toMatch(/does not exist/);
  });

  it('a file with only invalid rows reports an error and a sheet without data throws', async () => {
    const t = await csv('Page,Views\nA,x\n');
    expect(extractUsageMetrics(t, detectMapping(t.headers)).errors).toContain('No valid rows found.');
    await expect(csv('')).rejects.toThrow(/no data/);
    await expect(readUsageTable('x.pdf', 'a')).rejects.toThrow(/Unsupported/);
  });

  it('parseCsv handles quotes, escaped quotes, embedded newlines and delimiters', () => {
    expect(parseCsv('a,b\n"x, ""y""","line1\nline2"\n')).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('parseCount and toIsoDate', () => {
    expect([parseCount('1 250'), parseCount('1.250'), parseCount('1,250'), parseCount(' 7 '), parseCount(3), parseCount('1,5'), parseCount(-1), parseCount(1.5), parseCount('')])
      .toEqual([1250, 1250, 1250, 7, 3, null, null, null, null]);
    expect([toIsoDate('2026-01-05T10:00:00Z'), toIsoDate('5.1.2026'), toIsoDate('1/25/2026'), toIsoDate('25/1/2026'), toIsoDate(45000), toIsoDate('  '), toIsoDate('Q1')])
      .toEqual(['2026-01-05', '2026-01-05', '2026-01-25', '2026-01-25', '2023-03-15', undefined, 'Q1']);
  });
});

describe('usage metrics import – Excel', () => {
  it('reads an XLSX workbook with title row, real dates and numeric cells', async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Usage report export'],
      ['Report name', 'Page name', 'Views', 'Unique users', 'Date'],
      ['Sales', 'Overview', 300, 60, new Date(Date.UTC(2026, 0, 2))],
      ['Sales', 'Details', '1.250', 70, '2026-01-03'],
    ], { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Empty');
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const t = await readUsageTable('metrics.xlsx', bytes);
    expect(t.format).toBe('xlsx');
    expect(t.sheetName).toBe('Data');
    expect(t.headers).toEqual(['Report name', 'Page name', 'Views', 'Unique users', 'Date']);
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    expect(x.errors).toEqual([]);
    expect(x.metrics).toEqual([
      { report: 'Sales', page: 'Overview', views: 300, uniqueUsers: 60, date: '2026-01-02' },
      { report: 'Sales', page: 'Details', views: 1250, uniqueUsers: 70, date: '2026-01-03' },
    ]);
  });

  it('reads the legacy XLS format and rejects broken workbooks', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Seite', 'Aufrufe'], ['Start', 12]]), 'Blatt1');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'biff8' }) as ArrayBuffer;
    const t = await readUsageTable('alt.xls', bytes);
    expect(t.format).toBe('xls');
    expect(extractUsageMetrics(t, detectMapping(t.headers)).metrics).toEqual([{ page: 'Start', views: 12 }]);
    await expect(readUsageTable('kaputt.xlsx', new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe('usage metrics in the model', () => {
  it('mergeUsage replaces or appends without mutating the model and keeps import metadata', async () => {
    const t = await csv('Page,Views\nA,1\n');
    const x = extractUsageMetrics(t, detectMapping(t.headers));
    const existing = Object.freeze({ usageMetrics: Object.freeze([{ page: 'Old', views: 9 }]) as { page: string; views: number }[], usageMeta: { imports: [], reportFilter: 'R' } });
    const replaced = mergeUsage(existing, t, detectMapping(t.headers), x, 'replace');
    expect(replaced.usageMetrics).toEqual([{ page: 'A', views: 1 }]);
    expect(replaced.usageMeta.imports).toHaveLength(1);
    expect(replaced.usageMeta.imports[0]).toMatchObject({ fileName: 'usage.csv', format: 'csv', validRows: 1, skippedRows: 0, mapping: { page: 'Page', views: 'Views' } });
    const appended = mergeUsage(existing, t, detectMapping(t.headers), x, 'append');
    expect(appended.usageMetrics).toEqual([{ page: 'Old', views: 9 }, { page: 'A', views: 1 }]);
    expect(appended.usageMeta.reportFilter).toBe('R');
    expect(existing.usageMetrics).toHaveLength(1);
  });

  it('removing usage metrics keeps tables, measures and visuals', () => {
    const before = analyzeModel(demoModel);
    expect(before.usage.hasData).toBe(true);
    const stripped = withoutUsage(demoModel);
    expect('usageMetrics' in stripped).toBe(false);
    expect('usageMeta' in stripped).toBe(false);
    const after = analyzeModel(stripped);
    expect(after.usage.hasData).toBe(false);
    expect(after.summary).toEqual(before.summary);
    expect([...after.usage.measures.values()].every((u) => u.usageStatus === 'NO_USAGE_DATA')).toBe(true);
    expect(demoModel.usageMetrics).toBeDefined(); // input untouched
  });

  it('normalizeUsageMetrics drops malformed rows from old / hand-edited data', () => {
    expect(normalizeUsageMetrics('x')).toBeUndefined();
    expect(normalizeUsageMetrics([{ page: 'A', views: 5 }, { page: '', views: 1 }, { page: 'B', views: -1 }, null, { page: 'C', views: '1.250', uniqueUsers: '7', date: '2026-01-01' }]))
      .toEqual([{ page: 'A', views: 5 }, { page: 'C', views: 1250, uniqueUsers: 7, date: '2026-01-01' }]);
  });
});

describe('usage metrics – real-world export shapes', () => {
  it('recognises Power BI usage-metrics style headers and falls back to unambiguous "page"/"views" headers', () => {
    expect(detectMapping(['Report page', 'Total views', 'Unique viewers', 'Day'])).toEqual({ page: 'Report page', views: 'Total views', uniqueUsers: 'Unique viewers', date: 'Day' });
    // not in the alias list, but a single unambiguous candidate → detected; two candidates → left to the user
    expect(detectMapping(['Name of the page', 'Count', 'Distinct users'])).toEqual({ page: 'Name of the page' });
    expect(detectMapping(['Name of the page', 'Number of page opens', 'Distinct users'])).toEqual({});
    expect(detectMapping(['Page', 'Views [Sum]'])).toEqual({ page: 'Page', views: 'Views [Sum]' });
    expect(detectMapping(['Page', 'Total views', 'Page views 30d'])).toEqual({ page: 'Page', views: 'Total views' });
  });

  it('reads UTF-16 CSV (Excel "Unicode text") and Excel "sep=" preamble', async () => {
    const text = 'sep=;\nSeite;Aufrufe\nStart;12\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff; bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i++) { bytes[2 + i * 2] = text.charCodeAt(i); bytes[3 + i * 2] = 0; }
    const t = await readUsageTable('u.csv', bytes);
    expect(extractUsageMetrics(t, detectMapping(t.headers)).metrics).toEqual([{ page: 'Start', views: 12 }]);
  });
});
