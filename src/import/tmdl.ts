import type { Column, Measure, Table } from '../types/powerbi';
import type { ImportResult, ImportSource, ReportImporter } from './types';

/** TAB = 1 level; 4 spaces are tolerated as one level. */
function level(line: string): number {
  let tabs = 0;
  let spaces = 0;
  for (const ch of line) {
    if (ch === '\t') tabs++;
    else if (ch === ' ') spaces++;
    else break;
  }
  return tabs + Math.floor(spaces / 4);
}

/** Reads `Name` / `'Quoted ''Name'''` and returns the remainder after an optional `=`. */
function parseNameAndExpr(s: string): { name: string; expr: string } {
  s = s.trim();
  let name = '';
  let i = 0;
  if (s[0] === "'") {
    i = 1;
    while (i < s.length) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") { name += "'"; i += 2; continue; }
        i++;
        break;
      }
      name += s[i++];
    }
  } else {
    while (i < s.length && !/[\s=]/.test(s[i])) name += s[i++];
  }
  const rest = s.slice(i).trim();
  return { name, expr: rest.startsWith('=') ? rest.slice(1).trim() : '' };
}

const dedent = (lines: string[]): string => {
  const min = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[\t ]*/)![0].length), Infinity);
  return lines.map((l) => l.slice(Number.isFinite(min) ? min : 0)).join('\n').trim();
};

interface Block { expr: string; props: Record<string, string>; end: number }

/** Reads the expression (inline, indented body or ``` fenced) and the properties of the object starting at line `i`. */
function readBlock(lines: string[], i: number, ind: number, inline: string): Block {
  const n = lines.length;
  const props: Record<string, string> = {};
  const body: string[] = [];
  let j = i + 1;

  if (inline.startsWith('```')) {
    // fenced multi-line expression
    const first = inline.slice(3);
    const buf: string[] = first.includes('```') ? [first.slice(0, first.indexOf('```'))] : [first];
    if (!first.includes('```')) {
      while (j < n) {
        const l = lines[j++];
        const close = l.indexOf('```');
        if (close !== -1) { buf.push(l.slice(0, close)); break; }
        buf.push(l);
      }
    }
    body.push(...buf);
    inline = '';
  }

  let propsSeen = false;
  for (; j < n; j++) {
    const l = lines[j];
    if (!l.trim()) continue;
    const lv = level(l);
    if (lv <= ind) break;
    if (lv >= ind + 2 && !propsSeen) {
      body.push(l);
    } else if (lv === ind + 1) {
      propsSeen = true;
      const m = /^\s*([A-Za-z]\w*)\s*:\s*(.*)$/.exec(l);
      if (m) props[m[1]] = m[2].trim();
    }
  }
  const expr = [inline, body.length ? dedent(body) : ''].filter(Boolean).join('\n').trim();
  return { expr, props, end: j };
}

export function parseTmdl(text: string): Table[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const tables: Table[] = [];
  let cur: Table | null = null;
  let doc: string[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (t.startsWith('///')) { doc.push(t.slice(3).trim()); i++; continue; }
    const ind = level(line);

    if (ind === 0) {
      doc = [];
      const m = /^table\s+(.*)$/i.exec(t);
      if (m) {
        cur = { name: parseNameAndExpr(m[1]).name, measures: [], columns: [] };
        tables.push(cur);
      } else {
        cur = null; // model, expression, relationship, role, culture …
      }
      i++;
      continue;
    }

    if (cur && ind === 1) {
      const part = /^partition\s+(.*)$/i.exec(t);
      if (part) {
        // `partition X = calculated` + `source = <DAX>` → calculated table (field parameters live here)
        const isCalculated = parseNameAndExpr(part[1]).expr.toLowerCase() === 'calculated';
        let j = i + 1;
        while (j < lines.length && (!lines[j].trim() || level(lines[j]) > ind)) {
          const src = /^\s*source\s*=\s*(.*)$/.exec(lines[j]);
          if (src && level(lines[j]) === ind + 1) {
            const block = readBlock(lines, j, ind + 1, src[1].trim());
            if (isCalculated && block.expr) cur.dax = block.expr;
            j = block.end;
          } else {
            j++;
          }
        }
        doc = [];
        i = j;
        continue;
      }
      const m = /^(measure|column)\s+(.*)$/i.exec(t);
      if (m) {
        const { name, expr } = parseNameAndExpr(m[2]);
        const block = readBlock(lines, i, ind, expr);
        if (m[1].toLowerCase() === 'measure') {
          const me: Measure = { name, dax: block.expr };
          const description = block.props.description ?? (doc.length ? doc.join(' ') : undefined);
          if (description) me.description = description;
          if (block.props.displayFolder) me.displayFolder = block.props.displayFolder.replace(/^'|'$/g, '');
          cur.measures.push(me);
        } else {
          const col: Column = { name };
          if (block.props.dataType) col.dataType = block.props.dataType;
          if (block.expr) { col.calculated = true; col.dax = block.expr; }
          cur.columns.push(col);
        }
        doc = [];
        i = block.end;
        continue;
      }
    }
    doc = [];
    i++;
  }
  return tables;
}

/** Power BI Project (PBIP) semantic model: `definition/tables/*.tmdl` (also `model.tmdl`, ignored). */
export const tmdlImporter: ReportImporter = {
  id: 'tmdl',
  label: 'TMDL (PBIP semantic model)',
  description: 'Tables, columns, measures, calculated columns and calculated tables (incl. field parameters) from .tmdl files (definition/tables/*.tmdl). Select several files or the whole folder.',
  detect: (src: ImportSource) => /\.tmdl$/i.test(src.fileName),
  parse(src): ImportResult {
    const tables = parseTmdl(src.text).filter((t) => !/^(LocalDateTable_|DateTableTemplate_)/.test(t.name));
    const measures = tables.reduce((a, t) => a + t.measures.length, 0);
    return {
      model: { tables, visuals: [] },
      notes: tables.length ? [`${tables.length} table(s), ${measures} measure(s)`] : ['No table definition in this file (fine for model.tmdl, relationships.tmdl, …)'],
    };
  },
};
