/**
 * journey-csv.ts — CSV import/export for Journey CMS
 *
 * CSV format: flat, one row per step.
 * Journey metadata columns repeat on every row of that journey.
 * Multiple journeys in one file: group by journey_title.
 * Tags use pipe (|) as internal separator to avoid conflicting with CSV commas.
 * Sermon references: "seconds|url|note" (all optional).
 */

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Column definitions ────────────────────────────────────────────────────────

export const CSV_HEADERS = [
  "journey_title",
  "journey_description",
  "journey_type",       // core | companion
  "journey_status",     // Draft | Pastoral Review | Approved | Published | Archived
  "journey_tags",       // pipe-separated: prayer|faith|hope
  "step_number",        // integer ≥ 1
  "step_title",
  "mentor_intro",
  "scripture",
  "translation",        // NIV | ESV | KJV | etc.
  "memory_verse",
  "teaching",
  "reflection_question",
  "prayer",
  "todays_response",    // actionStep / todaysAction
  "ask_emmaus_prompt",  // one question (first suggestedFollowUpQuestion)
  "sermon_reference",   // seconds|url|contextual sentence  (all optional, pipe-separated)
  "completion_text",    // stored in content.completionText
  "estimated_time_minutes",
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];
export type CsvRow = Record<CsvHeader, string>;

// ─── Validation types ─────────────────────────────────────────────────────────

export interface CsvValidationError {
  row: number;   // 1-based data row (header = row 0)
  column: string;
  message: string;
}

export interface ParsedImportRow {
  row: number;
  data: CsvRow;
  errors: CsvValidationError[];
}

export interface ImportedStep {
  day: number;
  title: string;
  mentorIntro: string;
  scripture: string;
  preferredTranslation?: string;
  memoryVerse?: string;
  teachingContent: string;
  reflectionQuestion: string;
  prayer: string;
  todaysAction: string;
  suggestedFollowUpQuestions: string[];
  suggestedSermons: Array<{ timestamp?: number; link?: string; contextualSentence?: string }>;
  estimatedReadingTime?: number;
  completionText?: string;  // stored in content JSONB
}

export interface ImportedJourney {
  id: string;
  title: string;
  description: string;
  journeyType: string;
  status: string;
  tags: string[];
  steps: ImportedStep[];
}

export interface ImportParseResult {
  journeys: ImportedJourney[];
  rowErrors: CsvValidationError[];
  totalRows: number;
}

// ─── CSV parser (no external deps) ───────────────────────────────────────────

/** Parse raw CSV text into rows of string values */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'; i += 2;
      } else if (ch === '"') {
        inQuotes = false; i++;
      } else {
        field += ch; i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true; i++;
      } else if (ch === ',') {
        row.push(field); field = ""; i++;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field); field = ""; rows.push(row); row = []; i += 2;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field); field = ""; rows.push(row); row = []; i++;
      } else {
        field += ch; i++;
      }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  // Remove trailing empty rows
  while (rows.length && rows[rows.length - 1].every(c => c.trim() === "")) rows.pop();
  return rows;
}

/** Serialize a 2-D array into CSV text (values quoted when needed) */
export function serializeCsv(rows: string[][]): string {
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? "");
      return (s.includes(",") || s.includes('"') || s.includes("\n"))
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\r\n") + "\r\n";
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_TYPES = ["core", "companion"];
const VALID_STATUSES = ["draft", "pastoral review", "approved", "published", "archived"];

function validateRow(row: number, data: CsvRow): CsvValidationError[] {
  const errs: CsvValidationError[] = [];
  const req = (col: CsvHeader, label: string) => {
    if (!data[col]?.trim()) errs.push({ row, column: col, message: `${label} is required` });
  };
  req("journey_title", "Journey title");
  req("step_number", "Step number");
  req("step_title", "Step title");
  req("teaching", "Teaching content");

  const n = parseInt(data.step_number, 10);
  if (isNaN(n) || n < 1) errs.push({ row, column: "step_number", message: "Step number must be a positive integer" });

  if (data.journey_type && !VALID_TYPES.includes(data.journey_type.toLowerCase())) {
    errs.push({ row, column: "journey_type", message: `Type must be: ${VALID_TYPES.join(" | ")}` });
  }
  if (data.journey_status && !VALID_STATUSES.includes(data.journey_status.toLowerCase())) {
    errs.push({ row, column: "journey_status", message: `Status must be: ${VALID_STATUSES.map(s => s).join(" | ")}` });
  }
  if (data.estimated_time_minutes && isNaN(parseInt(data.estimated_time_minutes, 10))) {
    errs.push({ row, column: "estimated_time_minutes", message: "Must be a number (minutes)" });
  }
  return errs;
}

// ─── Sermon reference parser ──────────────────────────────────────────────────

function parseSermonRef(raw: string) {
  if (!raw?.trim()) return [];
  const [secStr, link, contextualSentence] = raw.split("|").map(s => s.trim());
  const timestamp = secStr ? parseInt(secStr, 10) : undefined;
  const entry: { timestamp?: number; link?: string; contextualSentence?: string } = {};
  if (timestamp && !isNaN(timestamp)) entry.timestamp = timestamp;
  if (link) entry.link = link;
  if (contextualSentence) entry.contextualSentence = contextualSentence;
  return Object.keys(entry).length ? [entry] : [];
}

// ─── Main import parser ───────────────────────────────────────────────────────

export function parseImportCsv(csvText: string): ImportParseResult {
  const rawRows = parseCsvText(csvText.trim());
  if (rawRows.length < 2) {
    return { journeys: [], rowErrors: [{ row: 1, column: "file", message: "File is empty or has no data rows" }], totalRows: 0 };
  }

  // Normalise header row
  const headers = rawRows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_")) as CsvHeader[];
  const dataRows = rawRows.slice(1);
  const totalRows = dataRows.length;
  const allErrors: CsvValidationError[] = [];

  // Unknown column warning — not blocking
  const known = new Set(CSV_HEADERS as readonly string[]);
  headers.forEach(h => { if (!known.has(h)) allErrors.push({ row: 0, column: h, message: `Unknown column "${h}" — will be ignored` }); });

  // Parse data rows
  const journeyMap = new Map<string, ImportedJourney>();

  dataRows.forEach((rawCells, idx) => {
    const rowNum = idx + 2; // 1-based, header = row 1
    const data = {} as CsvRow;
    headers.forEach((h, i) => { (data as Record<string, string>)[h] = rawCells[i]?.trim() ?? ""; });

    const rowErrors = validateRow(rowNum, data);
    allErrors.push(...rowErrors);

    const title = data.journey_title?.trim();
    if (!title) return;

    // Upsert journey group
    if (!journeyMap.has(title)) {
      const rawTags = data.journey_tags?.trim() ?? "";
      journeyMap.set(title, {
        id: slugify(title) + "-" + Date.now(),
        title,
        description: data.journey_description?.trim() ?? "",
        journeyType: data.journey_type?.trim().toLowerCase() === "companion" ? "companion" : "core",
        status: capitalizeStatus(data.journey_status?.trim() ?? "Draft"),
        tags: rawTags ? rawTags.split("|").map(t => t.trim()).filter(Boolean) : [],
        steps: [],
      });
    }

    const journey = journeyMap.get(title)!;
    const day = parseInt(data.step_number, 10);
    if (isNaN(day) || day < 1) return;

    const step: ImportedStep = {
      day,
      title: data.step_title?.trim() ?? "",
      mentorIntro: data.mentor_intro?.trim() ?? "",
      scripture: data.scripture?.trim() ?? "",
      preferredTranslation: data.translation?.trim() || undefined,
      memoryVerse: data.memory_verse?.trim() || undefined,
      teachingContent: data.teaching?.trim() ?? "",
      reflectionQuestion: data.reflection_question?.trim() ?? "",
      prayer: data.prayer?.trim() ?? "",
      todaysAction: data.todays_response?.trim() ?? "",
      suggestedFollowUpQuestions: data.ask_emmaus_prompt?.trim()
        ? [data.ask_emmaus_prompt.trim()] : [],
      suggestedSermons: parseSermonRef(data.sermon_reference ?? ""),
      estimatedReadingTime: data.estimated_time_minutes ? parseInt(data.estimated_time_minutes, 10) || undefined : undefined,
      completionText: data.completion_text?.trim() || undefined,
    };
    journey.steps.push(step);
  });

  // Sort steps within each journey
  journeyMap.forEach(j => j.steps.sort((a, b) => a.day - b.day));

  return { journeys: Array.from(journeyMap.values()), rowErrors: allErrors, totalRows };
}

// ─── Export serializer ────────────────────────────────────────────────────────

export interface ExportableJourney {
  title: string;
  description?: string;
  journeyType: string;
  status: string;
  tags?: string[];
  steps: Array<{
    day: number;
    title: string;
    mentorIntro?: string;
    scripture?: string;
    preferredTranslation?: string;
    memoryVerse?: string;
    devotional?: string;        // alias for teachingContent
    reflectionQuestion?: string;
    prayerPrompt?: string;      // alias for prayer
    actionStep?: string;        // alias for todaysAction
    suggestedFollowUpQuestions?: string[];
    suggestedSermons?: Array<{ timestamp?: number; link?: string; contextualSentence?: string }>;
    estimatedReadingTime?: number;
    content?: Record<string, unknown>;
  }>;
}

export function exportJourneysToCsv(journeys: ExportableJourney[]): string {
  const dataRows: string[][] = [];

  for (const journey of journeys) {
    for (const step of journey.steps) {
      const sermon = step.suggestedSermons?.[0];
      const sermonRef = sermon
        ? [(sermon.timestamp ?? ""), (sermon.link ?? ""), (sermon.contextualSentence ?? "")].join("|")
        : "";
      const completionText = (step.content as Record<string, string> | undefined)?.completionText ?? "";

      dataRows.push([
        journey.title ?? "",
        journey.description ?? "",
        journey.journeyType ?? "core",
        journey.status ?? "Draft",
        (journey.tags ?? []).join("|"),
        String(step.day),
        step.title ?? "",
        step.mentorIntro ?? "",
        step.scripture ?? "",
        step.preferredTranslation ?? "",
        step.memoryVerse ?? "",
        step.devotional ?? "",
        step.reflectionQuestion ?? "",
        step.prayerPrompt ?? "",
        step.actionStep ?? "",
        (step.suggestedFollowUpQuestions ?? [])[0] ?? "",
        sermonRef,
        completionText,
        step.estimatedReadingTime ? String(step.estimatedReadingTime) : "",
      ]);
    }
  }

  return serializeCsv([[...CSV_HEADERS], ...dataRows]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalizeStatus(s: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    "pastoral review": "Pastoral Review",
    approved: "Approved",
    published: "Published",
    archived: "Archived",
  };
  return map[s.toLowerCase()] ?? "Draft";
}
