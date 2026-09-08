/**
 * authored-content-tables.ts
 *
 * Canonical inventory of every authored-content table and the SQL hash
 * expression used to fingerprint its rows.
 *
 * This module is intentionally import-free so it can be consumed by:
 *
 *   src/scripts/content-checksum.ts   (node --experimental-strip-types)
 *   src/lib/__tests__/startup-integrity.test.ts  (node --import=tsx/esm)
 *
 * Hash method:  SHA-256 of `SELECT <hashExpr> FROM <table> ORDER BY id`
 * The hash changes if any tracked text column is inserted, deleted, or
 * rewritten. Rows are ordered by the uuid / text primary key `id` for
 * determinism.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 * All canonical authored text columns are included. JSONB columns (e.g.
 * major_themes, cross_references) are excluded: their JSON key ordering is
 * not guaranteed to be deterministic across Postgres versions. A startup
 * migration that mutates JSONB content would not be detected here — monitor
 * the content_audit_log table for those mutations instead.
 */

export interface AuthoredTable {
  /** Postgres table name */
  readonly name: string;
  /**
   * SQL expression selecting all canonical authored text columns concatenated
   * with `|` separators. Every field is wrapped in `COALESCE(col, '')` to
   * treat NULL and empty string equivalently.
   */
  readonly hashExpr: string;
}

export const AUTHORED_CONTENT_TABLES: readonly AuthoredTable[] = [
  // ── Journeys + Steps ────────────────────────────────────────────────────────
  {
    name: "journeys",
    // id is a text slug (e.g. "walk-through-luke"), not a uuid — no cast needed
    hashExpr: "id"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(subtitle, '')"
      + " || '|' || COALESCE(description, '')",
  },
  {
    name: "journey_steps",
    hashExpr: "id::text"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(mentor_intro, '')"
      + " || '|' || COALESCE(teaching_content, '')"
      + " || '|' || COALESCE(reflection_question, '')"
      + " || '|' || COALESCE(prayer, '')"
      + " || '|' || COALESCE(todays_action, '')",
  },

  // ── Collections ─────────────────────────────────────────────────────────────
  {
    name: "collections",
    hashExpr: "id::text"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(description, '')",
  },

  // ── Daily Devotionals ────────────────────────────────────────────────────────
  {
    name: "devotional_series",
    hashExpr: "id::text"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(description, '')",
  },
  {
    name: "devotional_entries",
    hashExpr: "id::text"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(scripture_reference, '')"
      + " || '|' || COALESCE(greeting, '')"
      + " || '|' || COALESCE(consider_this, '')"
      + " || '|' || COALESCE(prayer, '')"
      + " || '|' || COALESCE(next_step, '')"
      + " || '|' || COALESCE(closing, '')",
  },

  // ── Sermon Companions ────────────────────────────────────────────────────────
  {
    name: "sermon_companion",
    hashExpr: "id::text || '|' || COALESCE(title, '')",
  },
  {
    name: "sermon_companion_entry",
    hashExpr: "id::text"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(scripture_reference, '')"
      + " || '|' || COALESCE(greeting, '')"
      + " || '|' || COALESCE(reflection, '')"
      + " || '|' || COALESCE(prayer, '')"
      + " || '|' || COALESCE(next_step, '')"
      + " || '|' || COALESCE(closing, '')"
      + " || '|' || COALESCE(sermon_link, '')",
  },

  // ── Bible Study Notes ────────────────────────────────────────────────────────
  {
    name: "bible_study_notes",
    hashExpr: "id::text"
      + " || '|' || COALESCE(title, '')"
      + " || '|' || COALESCE(content, '')"
      + " || '|' || COALESCE(context_note, '')"
      + " || '|' || COALESCE(historical_note, '')"
      + " || '|' || COALESCE(original_language_note, '')"
      + " || '|' || COALESCE(jesus_connection, '')"
      + " || '|' || COALESCE(apply_it, '')"
      + " || '|' || COALESCE(key_truth, '')"
      + " || '|' || COALESCE(reflection_question, '')"
      + " || '|' || COALESCE(related_scriptures, '')",
  },

  // ── Bible Book Introductions ─────────────────────────────────────────────────
  {
    name: "bible_book_introductions",
    hashExpr: "id::text"
      + " || '|' || COALESCE(book_id, '')"
      + " || '|' || COALESCE(book_name, '')"
      + " || '|' || COALESCE(testament, '')"
      + " || '|' || COALESCE(genre, '')"
      + " || '|' || COALESCE(author_attribution, '')"
      + " || '|' || COALESCE(date_range, '')"
      + " || '|' || COALESCE(original_audience, '')"
      + " || '|' || COALESCE(historical_setting, '')"
      + " || '|' || COALESCE(purpose, '')"
      + " || '|' || COALESCE(points_to_jesus, '')"
      + " || '|' || COALESCE(interpretation_notes, '')",
  },

  // ── Bible Chapter Overviews ──────────────────────────────────────────────────
  {
    name: "bible_chapter_overviews",
    hashExpr: "id::text"
      + " || '|' || COALESCE(summary, '')"
      + " || '|' || COALESCE(key_verse, '')"
      + " || '|' || COALESCE(book_connection, '')"
      + " || '|' || COALESCE(jesus_connection, '')",
  },

  // ── Rooms ────────────────────────────────────────────────────────────────────
  {
    name: "rooms",
    hashExpr: "id::text || '|' || name || '|' || COALESCE(description, '')",
  },
];
