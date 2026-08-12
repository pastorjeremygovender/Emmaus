/**
 * bulk-import-utils.ts — Parsing + field auto-detection for the Bulk Import wizard.
 *
 * Pure utility: no React, no API calls. Designed to be extended with new formats
 * (Markdown, DOCX, AI-assisted) without touching the wizard UI.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ─── Destination types ────────────────────────────────────────────────────────

export type DestType = 'daily-rhythm' | 'walk' | 'devotional';

// ─── Canonical field names ────────────────────────────────────────────────────
// Superset of journey-step fields + devotional-entry fields.
// The wizard maps imported columns to these; the import handler maps
// canonical fields → the correct API payload for each destination type.

export type CanonicalField =
  | 'day'               // step/day number (required)
  | 'title'             // step title (required)
  | 'scripture'         // journey: scripture | devotional: scriptureReference
  | 'mentorIntro'       // journey: mentorIntro | devotional: greeting
  | 'devotional'        // journey: devotional  | devotional: considerThis
  | 'reflectionQuestion'
  | 'prayerPrompt'      // journey: prayerPrompt | devotional: prayer
  | 'actionStep'        // journey: actionStep   | devotional: nextStep
  | 'closingText'       // journey: closingText  | devotional: closing
  | 'memoryVerse'
  | 'status';

export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  day:                'Day / Step Number',
  title:              'Title',
  scripture:          'Scripture Reference',
  mentorIntro:        'Greeting / Mentor Intro',
  devotional:         'Devotional / Reflection',
  reflectionQuestion: 'Reflection Question',
  prayerPrompt:       'Prayer',
  actionStep:         'Your Next Step',
  closingText:        'Closing',
  memoryVerse:        'Memory Verse',
  status:             'Status',
};

// ─── Alias map ────────────────────────────────────────────────────────────────
// normalizedKey → CanonicalField. Order matters for dedup.

const ALIASES: Record<string, CanonicalField> = {
  // day
  day: 'day', daynumber: 'day', stepnumber: 'day', step: 'day',
  no: 'day', number: 'day', '#': 'day', dayno: 'day', stepno: 'day',
  // title
  title: 'title', name: 'title', heading: 'title',
  // scripture
  scripture: 'scripture', scriptureref: 'scripture', scripturereference: 'scripture',
  verse: 'scripture', passage: 'scripture', reference: 'scripture',
  // mentorIntro / greeting
  greeting: 'mentorIntro', mentorintro: 'mentorIntro', intro: 'mentorIntro',
  introduction: 'mentorIntro', mentor: 'mentorIntro', opening: 'mentorIntro',
  // devotional / reflection
  devotional: 'devotional', reflection: 'devotional', considerthis: 'devotional',
  body: 'devotional', content: 'devotional', message: 'devotional', reading: 'devotional',
  // reflectionQuestion
  reflectionquestion: 'reflectionQuestion', question: 'reflectionQuestion',
  // prayer
  prayer: 'prayerPrompt', prayerprompt: 'prayerPrompt',
  // actionStep / next step
  actionstep: 'actionStep', nextstep: 'actionStep', yournextstep: 'actionStep',
  action: 'actionStep', application: 'actionStep', nextsteps: 'actionStep',
  // closing
  closing: 'closingText', closingtext: 'closingText', outro: 'closingText',
  sendoff: 'closingText', close: 'closingText',
  // memoryVerse
  memoryverse: 'memoryVerse', memoryscripture: 'memoryVerse',
  // status
  status: 'status',
};

export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9#]/g, '');
}

// ─── Column mapping ───────────────────────────────────────────────────────────

export interface ColumnMapping {
  sourceColumn: string;
  canonicalField: CanonicalField | null;  // null = skip this column
  autoDetected: boolean;
  sampleValues: string[];
}

export function autoDetectMapping(
  headers: string[],
  sampleRows: Record<string, string>[]
): ColumnMapping[] {
  const used = new Set<CanonicalField>();
  return headers.map(col => {
    const key = normalizeKey(col);
    const canonical = ALIASES[key] ?? null;
    // De-dup: only assign each canonical field once
    const dedupedCanonical = canonical && !used.has(canonical) ? canonical : null;
    if (dedupedCanonical) used.add(dedupedCanonical);
    const sampleValues = sampleRows.slice(0, 3).map(r => (r[col] ?? '').slice(0, 60)).filter(Boolean);
    return { sourceColumn: col, canonicalField: dedupedCanonical, autoDetected: !!dedupedCanonical, sampleValues };
  });
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
}

export function parseCSVText(text: string): ParseResult {
  try {
    const result = Papa.parse<Record<string, string>>(text.trim(), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    if (result.errors.length > 0 && result.data.length === 0) {
      return { headers: [], rows: [], error: result.errors[0]?.message ?? 'CSV parse error' };
    }
    const headers = result.meta.fields ?? [];
    return { headers, rows: result.data };
  } catch (e: unknown) {
    return { headers: [], rows: [], error: e instanceof Error ? e.message : 'CSV parse error' };
  }
}

export function parseXLSXBuffer(buf: ArrayBuffer): ParseResult {
  try {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { headers: [], rows: [], error: 'No sheets found in workbook' };
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rawRows.length === 0) return { headers: [], rows: [] };
    const headers = Object.keys(rawRows[0]);
    const rows = rawRows.map(r =>
      Object.fromEntries(headers.map(h => [h, String(r[h] ?? '')]))
    );
    return { headers, rows };
  } catch (e: unknown) {
    return { headers: [], rows: [], error: e instanceof Error ? e.message : 'XLSX parse error' };
  }
}

// ─── Mapped row ───────────────────────────────────────────────────────────────

export interface MappedRow {
  day: number;
  title: string;
  scripture: string;
  mentorIntro: string;
  devotional: string;
  reflectionQuestion: string;
  prayerPrompt: string;
  actionStep: string;
  closingText: string;
  memoryVerse: string;
  status: 'Draft' | 'Published';
}

export function applyMappings(
  rawRows: Record<string, string>[],
  mappings: ColumnMapping[],
  defaultStatus: 'Draft' | 'Published' = 'Draft'
): MappedRow[] {
  return rawRows.map(raw => {
    const m: Partial<MappedRow> = {};
    for (const mapping of mappings) {
      if (!mapping.canonicalField) continue;
      const val = (raw[mapping.sourceColumn] ?? '').trim();
      if (mapping.canonicalField === 'day') {
        m.day = parseInt(val, 10) || 0;
      } else if (mapping.canonicalField === 'status') {
        const lo = val.toLowerCase();
        m.status = lo === 'published' || lo === 'publish' ? 'Published' : 'Draft';
      } else {
        (m as Record<string, string>)[mapping.canonicalField] = val;
      }
    }
    return {
      day: m.day ?? 0,
      title: m.title ?? '',
      scripture: m.scripture ?? '',
      mentorIntro: m.mentorIntro ?? '',
      devotional: m.devotional ?? '',
      reflectionQuestion: m.reflectionQuestion ?? '',
      prayerPrompt: m.prayerPrompt ?? '',
      actionStep: m.actionStep ?? '',
      closingText: m.closingText ?? '',
      memoryVerse: m.memoryVerse ?? '',
      status: m.status ?? defaultStatus,
    };
  });
}

// ─── Parsed row (with validation + conflict state) ────────────────────────────

export type ConflictResolution = 'skip' | 'replace' | 'new-draft';

export interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  mapped: MappedRow;
  warnings: string[];
  conflict: boolean;
  conflictResolution: ConflictResolution | null;
}

export function buildParsedRows(
  rawRows: Record<string, string>[],
  mappings: ColumnMapping[],
  existingDays: Set<number>,
  defaultStatus: 'Draft' | 'Published' = 'Draft'
): ParsedRow[] {
  const mappedRows = applyMappings(rawRows, mappings, defaultStatus);
  const seenDays = new Map<number, number>(); // day → first-seen index

  return mappedRows.map((mapped, i) => {
    const warnings: string[] = [];

    if (!mapped.day || mapped.day <= 0) {
      warnings.push('Missing or invalid day / step number');
    }
    if (!mapped.title.trim()) {
      warnings.push('Missing title');
    }
    if (mapped.day > 0 && seenDays.has(mapped.day)) {
      warnings.push(`Duplicate day ${mapped.day} in this import (first at row ${seenDays.get(mapped.day)! + 1})`);
    } else if (mapped.day > 0) {
      seenDays.set(mapped.day, i);
    }

    const conflict = mapped.day > 0 && existingDays.has(mapped.day);
    return { index: i, raw: rawRows[i], mapped, warnings, conflict, conflictResolution: null };
  });
}

// ─── Import result ────────────────────────────────────────────────────────────

export interface ImportError {
  day: number;
  title: string;
  reason: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: ImportError[];
}
