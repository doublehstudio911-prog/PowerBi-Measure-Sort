/**
 * Robust, dependency-free DAX reference extractor.
 *
 * It does NOT try to fully parse DAX. It tokenizes the text (so that comments,
 * string literals, quoted table names and bracketed names are handled exactly)
 * and extracts every `[Name]`, `Table[Name]` and `'Table Name'[Name]` reference.
 *
 * Whether such a reference is a measure or a column can only be decided with
 * knowledge of the model – that happens in dependencyResolver.ts.
 */

export type DaxTokenKind = 'ident' | 'quoted' | 'bracket' | 'string' | 'number' | 'punct';

export interface DaxToken {
  kind: DaxTokenKind;
  /** Decoded value (unescaped, without delimiters) */
  value: string;
  /** Was there whitespace / a comment directly before this token? */
  spaceBefore: boolean;
}

/** A `[Name]` or `Table[Name]` occurrence. */
export interface DaxRef {
  /** Table qualifier if present (already unquoted) */
  table?: string;
  /** Text between the brackets */
  name: string;
}

export interface ParsedDax {
  /** De-duplicated `[Name]` / `Table[Name]` references. Includes the references found inside NAMEOF(). */
  refs: DaxRef[];
  /** De-duplicated references that appear as argument of NAMEOF() – field parameters list their fields this way */
  nameOfRefs: DaxRef[];
  /** Names declared with VAR */
  variables: string[];
  /**
   * Bare or quoted identifiers that are not function calls and not followed by `[`.
   * In DAX these are table names (or variable names) – used for "tables used".
   */
  identifiers: string[];
  /** Called functions in upper case (informational) */
  functions: string[];
}

export interface ParseOptions {
  /** If DAX starts with a header like `Name =`, `[Name] =` or `Table[Name] =`, strip it when it matches. */
  selfName?: string;
}

const KEYWORDS = new Set([
  'VAR', 'RETURN', 'IN', 'DEFINE', 'EVALUATE', 'MEASURE', 'COLUMN', 'TABLE',
  'ORDER', 'BY', 'ASC', 'DESC', 'START', 'AT', 'NOT', 'AND', 'OR', 'TRUE', 'FALSE',
]);

const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_]/u;
const DIGIT = /[0-9]/;

export function tokenizeDax(src: string): DaxToken[] {
  const tokens: DaxToken[] = [];
  const n = src.length;
  let i = 0;
  let space = false;

  const push = (kind: DaxTokenKind, value: string) => {
    tokens.push({ kind, value, spaceBefore: space });
    space = false;
  };

  /** Reads a delimited token where the closing delimiter is escaped by doubling. Unterminated → runs to end. */
  const readDelimited = (close: string): string => {
    let out = '';
    i++; // skip opener
    while (i < n) {
      const ch = src[i];
      if (ch === close) {
        if (src[i + 1] === close) {
          out += close;
          i += 2;
          continue;
        }
        i++;
        return out;
      }
      out += ch;
      i++;
    }
    return out;
  };

  while (i < n) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      space = true;
      i++;
      continue;
    }
    // comments
    if ((ch === '/' && src[i + 1] === '/') || (ch === '-' && src[i + 1] === '-')) {
      while (i < n && src[i] !== '\n') i++;
      space = true;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      space = true;
      continue;
    }
    if (ch === '"') {
      push('string', readDelimited('"'));
      continue;
    }
    if (ch === "'") {
      push('quoted', readDelimited("'"));
      continue;
    }
    if (ch === '[') {
      // Bracket names: `]]` escapes a closing bracket
      push('bracket', readDelimited(']').trim());
      continue;
    }
    if (IDENT_START.test(ch)) {
      const start = i;
      while (i < n && IDENT_PART.test(src[i])) i++;
      push('ident', src.slice(start, i));
      continue;
    }
    if (DIGIT.test(ch)) {
      const start = i;
      while (i < n && /[0-9.eE]/.test(src[i])) i++;
      push('number', src.slice(start, i));
      continue;
    }
    push('punct', ch);
    i++;
  }
  return tokens;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Removes a leading `Name =` header when it matches `selfName`. Returns index of first body token. */
function headerLength(tokens: DaxToken[], selfName?: string): number {
  if (!selfName) return 0;
  let p = 0;
  // optional `DEFINE` / `MEASURE`
  while (
    tokens[p]?.kind === 'ident' &&
    ['DEFINE', 'MEASURE'].includes(tokens[p].value.toUpperCase())
  ) {
    p++;
  }
  const t0 = tokens[p];
  if (!t0) return 0;
  let q = p;
  let name: string | undefined;
  if (t0.kind === 'bracket') {
    name = t0.value;
    q = p + 1;
  } else if ((t0.kind === 'ident' || t0.kind === 'quoted') && tokens[p + 1]?.kind === 'bracket' && !tokens[p + 1].spaceBefore) {
    name = tokens[p + 1].value;
    q = p + 2;
  } else if (t0.kind === 'ident' || t0.kind === 'quoted') {
    // `Name = expr` – unquoted names cannot contain spaces, quoted ones can
    name = t0.value;
    q = p + 1;
  }
  if (name === undefined) return 0;
  const eq = tokens[q];
  const after = tokens[q + 1];
  if (eq?.kind === 'punct' && eq.value === '=' && !(after?.kind === 'punct' && after.value === '=') && norm(name) === norm(selfName)) {
    return q + 1;
  }
  return 0;
}

const refKey = (r: DaxRef) => `${(r.table ?? '').trim().toLowerCase()}\u0000${r.name.trim().toLowerCase()}`;

function dedupeRefs(list: DaxRef[]): DaxRef[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = refKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** For `NAMEOF ( <ref> )` at token index `i` (the NAMEOF identifier) returns the referenced field, if well-formed. */
function readNameOfArgument(tokens: DaxToken[], i: number): DaxRef | null {
  const open = tokens[i + 1];
  if (open?.kind !== 'punct' || open.value !== '(') return null;
  const a = tokens[i + 2];
  const b = tokens[i + 3];
  if (a?.kind === 'bracket') return { name: a.value };
  if ((a?.kind === 'ident' || a?.kind === 'quoted') && b?.kind === 'bracket' && !b.spaceBefore) return { table: a.value, name: b.value };
  return null;
}

export function parseDax(dax: string, options: ParseOptions = {}): ParsedDax {
  const tokens = tokenizeDax(dax ?? '');
  const start = headerLength(tokens, options.selfName);

  const refs: DaxRef[] = [];
  const nameOfRefs: DaxRef[] = [];
  const variables: string[] = [];
  const identifiers: string[] = [];
  const functions: string[] = [];

  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];

    if (t.kind === 'bracket') {
      refs.push({ name: t.value });
      continue;
    }

    if (t.kind === 'ident' || t.kind === 'quoted') {
      const isKeyword = t.kind === 'ident' && KEYWORDS.has(t.value.toUpperCase());

      if (t.kind === 'ident' && t.value.toUpperCase() === 'VAR' && next && (next.kind === 'ident' || next.kind === 'quoted')) {
        variables.push(next.value);
        i++; // the variable name is not a table / measure reference
        continue;
      }

      if (isKeyword) continue;

      if (next?.kind === 'bracket' && !next.spaceBefore) {
        // Table[Name] / 'Table'[Name] / variable[Column]
        refs.push({ table: t.value, name: next.value });
        i++;
        continue;
      }
      if (t.kind === 'ident' && next?.kind === 'punct' && next.value === '(') {
        functions.push(t.value.toUpperCase());
        if (t.value.toUpperCase() === 'NAMEOF') {
          const arg = readNameOfArgument(tokens, i);
          if (arg) nameOfRefs.push(arg);
        }
        continue;
      }
      identifiers.push(t.value);
    }
    // strings, numbers, punctuation: ignored
  }

  return { refs: dedupeRefs(refs), nameOfRefs: dedupeRefs(nameOfRefs), variables, identifiers, functions };
}
