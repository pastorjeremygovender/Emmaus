/**
 * bulk-import-emmaus-parser.ts
 *
 * Pure parser for Emmaus-structured text (the format ChatGPT and Emmaus admins
 * naturally produce). Converts pasted text directly into MappedRow objects —
 * the same type used by the CSV/XLSX import pipeline — so zero downstream
 * changes are needed in the import/conflict/results flow.
 *
 * Format example:
 *   Day: 10
 *   Title: Faith That Trusts Jesus
 *   Scripture Reference: John 4:43–54
 *
 *   Greeting:
 *   Good morning. I'm glad you're here.
 *
 *   Reflection:
 *   A royal official came to Jesus...
 *
 *   Prayer:
 *   Father, help me to trust You. Amen.
 *
 *   Your Next Step:
 *   Think of an area where you need to trust God today.
 *
 *   Closing:
 *   Tomorrow we'll discover...
 *
 * Multiple items may be pasted together; a new item begins when a new Day:/Step:
 * field is encountered after the current item has already started.
 */

import type { MappedRow } from './bulk-import-utils';

// ─── Field label aliases → canonical field keys ───────────────────────────────

type EmmausField =
  | 'day'
  | 'title'
  | 'scripture'
  | 'mentorIntro'
  | 'devotional'
  | 'reflectionQuestion'
  | 'prayerPrompt'
  | 'actionStep'
  | 'closingText';

/** Maps normalised label text → canonical field. Order matters (longest-first wins nothing here — we strip all punctuation before matching). */
const LABEL_MAP: Record<string, EmmausField> = {
  // day / step number
  'day':         'day',
  'daynumber':   'day',
  'step':        'day',
  'stepnumber':  'day',

  // title
  'title': 'title',

  // scripture
  'scripture':          'scripture',
  'scripturereference': 'scripture',
  'verse':              'scripture',
  'versereference':     'scripture',

  // greeting / mentor intro
  'greeting':     'mentorIntro',
  'intro':        'mentorIntro',
  'introduction': 'mentorIntro',

  // reflection / devotional body
  'reflection': 'devotional',
  'devotional': 'devotional',
  'teaching':   'devotional',

  // reflection question (rare, but keep separate)
  'reflectionquestion': 'reflectionQuestion',
  'question':           'reflectionQuestion',

  // prayer
  'prayer': 'prayerPrompt',

  // next step / action
  'yournextstep': 'actionStep',
  'nextstep':     'actionStep',
  'nextsteps':    'actionStep',
  'application':  'actionStep',

  // closing
  'closing': 'closingText',
};

/** Normalise a label for map lookup: lowercase, strip everything except a-z0-9. */
function normaliseLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Item accumulator ─────────────────────────────────────────────────────────

interface ItemAccumulator {
  day: string;
  title: string;
  scripture: string;
  mentorIntro: string[];        // paragraphs
  devotional: string[];
  reflectionQuestion: string[];
  prayerPrompt: string[];
  actionStep: string[];
  closingText: string[];
  currentField: EmmausField | null;
}

function blankItem(): ItemAccumulator {
  return {
    day: '', title: '', scripture: '',
    mentorIntro: [], devotional: [], reflectionQuestion: [],
    prayerPrompt: [], actionStep: [], closingText: [],
    currentField: null,
  };
}

function hasContent(item: ItemAccumulator): boolean {
  return !!(item.day || item.title || item.scripture ||
    item.mentorIntro.length || item.devotional.length ||
    item.prayerPrompt.length || item.actionStep.length || item.closingText.length);
}

// ─── Separator line detection ─────────────────────────────────────────────────
// Lines like "---" or "==================" are section separators, not content.

const SEPARATOR_RE = /^[-=*_]{3,}$/;

// ─── Label line detection ─────────────────────────────────────────────────────
// A label line is "Label:" with optional trailing text on the same line.
// It must match a known field. We try "full line minus trailing colon" first
// (multi-word labels like "Scripture Reference:"), then first-word-only fallback.

interface LabelMatch {
  field: EmmausField;
  inlineValue: string;   // text after the colon on the same line, if any
  isItemStart: boolean;  // true when field is 'day' or 'step'
}

function tryParseLabel(line: string): LabelMatch | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx < 1) return null;

  const labelPart = line.slice(0, colonIdx).trim();
  const rest      = line.slice(colonIdx + 1).trim();
  const key       = normaliseLabel(labelPart);
  const field     = LABEL_MAP[key] ?? null;
  if (!field) return null;

  return {
    field,
    inlineValue: rest,
    isItemStart: field === 'day',
  };
}

// ─── Flush accumulator → MappedRow ───────────────────────────────────────────

function joinField(lines: string[]): string {
  // Trim leading/trailing blank lines, then join with real newlines.
  // Internal blank lines become paragraph separators.
  const trimmed = lines.join('\n').trim();
  return trimmed;
}

function flushItem(
  item: ItemAccumulator,
  defaultStatus: 'Draft' | 'Published'
): MappedRow {
  return {
    day:                parseInt(item.day, 10) || 0,
    title:              item.title.trim(),
    scripture:          item.scripture.trim(),
    mentorIntro:        joinField(item.mentorIntro),
    devotional:         joinField(item.devotional),
    reflectionQuestion: joinField(item.reflectionQuestion),
    prayerPrompt:       joinField(item.prayerPrompt),
    actionStep:         joinField(item.actionStep),
    closingText:        joinField(item.closingText),
    memoryVerse:        '',
    status:             defaultStatus,
  };
}

// ─── Main parse function ──────────────────────────────────────────────────────

export interface EmmausParseResult {
  items: MappedRow[];
  /** Human-readable warnings per item index */
  warnings: string[][];
  error?: string;
}

/**
 * Parse pasted Emmaus-format text into MappedRow objects.
 *
 * @param text          Raw pasted text
 * @param defaultStatus Status to apply to each item (admin-controlled)
 */
export function parseEmmausText(
  text: string,
  defaultStatus: 'Draft' | 'Published' = 'Draft'
): EmmausParseResult {
  if (!text.trim()) {
    return { items: [], warnings: [], error: 'No content pasted.' };
  }

  const lines = text.split('\n');
  const completedItems: ItemAccumulator[] = [];
  let current = blankItem();

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const line = raw.trimEnd(); // keep leading spaces for poetry/formatting

    // Skip pure separator lines (---, ===, etc.)
    if (SEPARATOR_RE.test(line.trim())) continue;

    // Try to parse as a label
    const labelMatch = tryParseLabel(line);

    if (labelMatch) {
      // Check if this starts a NEW item
      if (labelMatch.isItemStart && hasContent(current)) {
        // Save previous item and start fresh
        completedItems.push(current);
        current = blankItem();
      }

      current.currentField = labelMatch.field;

      // Handle single-line fields (day, title, scripture) — value is on same line
      if (labelMatch.field === 'day') {
        current.day = labelMatch.inlineValue;
        current.currentField = null; // day is always single-line
      } else if (labelMatch.field === 'title') {
        current.title = labelMatch.inlineValue;
        current.currentField = null; // title is always single-line
      } else if (labelMatch.field === 'scripture') {
        current.scripture = labelMatch.inlineValue;
        current.currentField = null; // scripture is always single-line
      } else {
        // Multi-line field — inline value (if any) is the first line of content
        if (labelMatch.inlineValue) {
          appendToField(current, labelMatch.field, labelMatch.inlineValue);
        }
        // currentField stays set so subsequent lines are appended
      }

    } else if (current.currentField) {
      // We're inside a multi-line field — append this line as content
      appendToField(current, current.currentField, line);
    }
    // else: line before any recognised field — silently skip
  }

  // Save the last item
  if (hasContent(current)) {
    completedItems.push(current);
  }

  if (completedItems.length === 0) {
    return {
      items: [],
      warnings: [],
      error:
        'No Emmaus content items detected. Make sure each item starts with "Day: <number>" or "Step: <number>" and includes a Title.',
    };
  }

  // Convert accumulators → MappedRows + per-item warnings
  const items: MappedRow[] = [];
  const warnings: string[][] = [];
  const seenDays = new Map<number, number>(); // day → first-seen index

  for (let idx = 0; idx < completedItems.length; idx++) {
    const acc = completedItems[idx];
    const row = flushItem(acc, defaultStatus);
    const itemWarnings: string[] = [];

    if (!row.day || row.day <= 0) {
      itemWarnings.push('Missing or invalid day / step number');
    }
    if (!row.title) {
      itemWarnings.push('Missing title');
    }
    if (row.day > 0 && seenDays.has(row.day)) {
      itemWarnings.push(
        `Duplicate day ${row.day} in this paste (first at item ${seenDays.get(row.day)! + 1})`
      );
    } else if (row.day > 0) {
      seenDays.set(row.day, idx);
    }

    items.push(row);
    warnings.push(itemWarnings);
  }

  return { items, warnings };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function appendToField(item: ItemAccumulator, field: EmmausField, line: string): void {
  switch (field) {
    case 'mentorIntro':        item.mentorIntro.push(line);        break;
    case 'devotional':         item.devotional.push(line);         break;
    case 'reflectionQuestion': item.reflectionQuestion.push(line); break;
    case 'prayerPrompt':       item.prayerPrompt.push(line);       break;
    case 'actionStep':         item.actionStep.push(line);         break;
    case 'closingText':        item.closingText.push(line);        break;
    // day / title / scripture are single-line — should never reach here
  }
}
