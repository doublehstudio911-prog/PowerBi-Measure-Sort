import type { ReportModel } from '../types/powerbi';

export interface ImportSource {
  fileName: string;
  /** Raw decoded text */
  text: string;
  /** Parsed JSON, or undefined if the text is not valid JSON */
  json?: unknown;
}

/** Partial: a file may contribute only a model (BIM) or only visuals (report layout). */
export interface ImportResult {
  model: ReportModel;
  notes: string[];
}

/**
 * Pluggable importer contract. To add a real Power BI import (PBIX / PBIP / XMLA / Fabric REST …)
 * implement this interface and register it in `registry.ts` – nothing else in the app changes.
 */
export interface ReportImporter {
  id: string;
  label: string;
  description: string;
  /** Cheap check whether this importer understands the source. */
  detect(src: ImportSource): boolean;
  parse(src: ImportSource): ImportResult;
}
