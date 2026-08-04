/**
 * Startup migrations — idempotent schema upgrades that run on every boot.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DATA SAFETY RULE — READ BEFORE EDITING THIS FILE                       ║
 * ║                                                                          ║
 * ║  This file MUST contain only schema DDL:                                 ║
 * ║    • CREATE TABLE IF NOT EXISTS                                          ║
 * ║    • ALTER TABLE … ADD COLUMN IF NOT EXISTS                             ║
 * ║    • CREATE [UNIQUE] INDEX IF NOT EXISTS                                 ║
 * ║                                                                          ║
 * ║  NEVER add to this file:                                                 ║
 * ║    • INSERT / UPDATE / DELETE on authored content tables                 ║
 * ║      (journeys, journey_steps, collections, devotional_series,           ║
 * ║       devotional_entries, sermon_companion, sermon_companion_entry,      ║
 * ║       bible_study_notes, bible_book_introductions, bible_chapter_overviews) ║
 * ║    • INSERT / UPDATE / DELETE on user data tables                        ║
 * ║      (user_journey_progress, devotional_progress,                        ║
 * ║       sermon_companion_progress, user_profiles, user_bible_data)         ║
 * ║                                                                          ║
 * ║  Authored content seeding belongs in:  scripts/seed-content.ts           ║
 * ║  Demo/sample content belongs in:       scripts/seed-demo.ts              ║
 * ║  Both scripts block automatically on NODE_ENV=production.                ║
 * ║                                                                          ║
 * ║  WHY THIS RULE EXISTS:                                                   ║
 * ║  A previous migration ran DELETE FROM journey_steps on every boot,       ║
 * ║  wiping authored step content that could not be recovered from git.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { setStartSharedReady } from "./feature-flags.js";
import { verifySermonStore } from "./sermon-store.js";
import { FFMPEG_BIN, FFMPEG_AVAILABLE } from "./audio-transcription.js";

export async function runStartupMigrations(): Promise<void> {
  // ── Sermon store diagnostic (runs every boot — confirms data is reachable) ──
  await verifySermonStore().catch((err) =>
    logger.warn({ err }, "Sermon store diagnostic failed (non-fatal)")
  );

  // ── Sermon Companion tables (2026-07) ─────────────────────────────────────────
  // Three tables for AI-generated sermon companions. sermon_id is text (not FK)
  // because sermons are stored in a JSON file, not a DB table.

  try {
    await pool.query(`
      ALTER TABLE sermon_companion_entry
        ADD COLUMN IF NOT EXISTS sermon_link text NOT NULL DEFAULT '';
    `);
    logger.info("Startup migration: sermon_companion_entry.sermon_link column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon_companion_entry.sermon_link column failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE sermon_companion
        ADD COLUMN IF NOT EXISTS published_at timestamp;
    `);
    logger.info("Startup migration: sermon_companion.published_at column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon_companion.published_at column failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE sermon_companion
        ADD COLUMN IF NOT EXISTS is_current_week boolean NOT NULL DEFAULT false;
    `);
    logger.info("Startup migration: sermon_companion.is_current_week column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon_companion.is_current_week column failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE sermon_companion
        ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
    `);
    logger.info("Startup migration: sermon_companion.description column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon_companion.description column failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sermon_companion (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sermon_id text NOT NULL,
        title text NOT NULL DEFAULT '',
        number_of_days integer NOT NULL DEFAULT 5,
        status text NOT NULL DEFAULT 'Draft',
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sermon_companion_entry (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        companion_id uuid NOT NULL REFERENCES sermon_companion(id) ON DELETE CASCADE,
        day_number integer NOT NULL,
        title text NOT NULL DEFAULT '',
        scripture_reference text DEFAULT '',
        greeting text DEFAULT '',
        reflection text DEFAULT '',
        prayer text DEFAULT '',
        next_step text DEFAULT '',
        closing text DEFAULT '',
        status text NOT NULL DEFAULT 'Draft',
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (companion_id, day_number)
      );

      CREATE TABLE IF NOT EXISTS sermon_companion_progress (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        companion_id uuid NOT NULL REFERENCES sermon_companion(id) ON DELETE CASCADE,
        current_day integer NOT NULL DEFAULT 1,
        completed_days jsonb NOT NULL DEFAULT '[]',
        status text NOT NULL DEFAULT 'active',
        started_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, companion_id)
      );
    `);
    logger.info("Startup migration: sermon companion tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon companion tables failed (non-fatal)");
  }

  // ── Daily Devotionals tables (2026-07) ───────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devotional_series (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        description text DEFAULT '',
        series_type text NOT NULL DEFAULT 'general',
        status text NOT NULL DEFAULT 'Draft',
        published_at timestamp,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        created_by text
      );

      CREATE TABLE IF NOT EXISTS devotional_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        series_id uuid NOT NULL REFERENCES devotional_series(id) ON DELETE CASCADE,
        day_number integer NOT NULL,
        title text NOT NULL DEFAULT '',
        scripture_reference text DEFAULT '',
        greeting text DEFAULT '',
        consider_this text DEFAULT '',
        prayer text DEFAULT '',
        next_step text DEFAULT '',
        closing text DEFAULT '',
        status text NOT NULL DEFAULT 'Draft',
        published_at timestamp,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (series_id, day_number)
      );

      CREATE TABLE IF NOT EXISTS devotional_progress (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        series_id uuid NOT NULL REFERENCES devotional_series(id) ON DELETE CASCADE,
        current_day integer NOT NULL DEFAULT 1,
        completed_days jsonb NOT NULL DEFAULT '[]',
        status text NOT NULL DEFAULT 'active',
        started_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, series_id)
      );
    `);
    logger.info("Startup migration: devotional tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: devotional tables failed (non-fatal)");
  }

  // ── Active Engagement Platform Rule: status columns (2026-07) ───────────────
  try {
    await pool.query(`
      ALTER TABLE devotional_progress
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
    `);
    logger.info("Startup migration: devotional_progress.status column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: devotional_progress.status column failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE sermon_companion_progress
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
    `);
    logger.info("Startup migration: sermon_companion_progress.status column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon_companion_progress.status column failed (non-fatal)");
  }

  // ── User profiles table (2026-07) ────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        email TEXT PRIMARY KEY,
        preferred_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Startup migration: user_profiles table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: user_profiles table failed (non-fatal)");
  }

  // ── Walk Completion step column (2026-07) ─────────────────────────────────────
  // Adds is_completion_step boolean column to journey_steps (schema DDL only).
  // The column defaults false — existing steps are unaffected.
  // Application code (createStep / updateStep) maintains this field at write time.
  try {
    await pool.query(`
      ALTER TABLE journey_steps
        ADD COLUMN IF NOT EXISTS is_completion_step boolean NOT NULL DEFAULT false;
    `);
    logger.info("Startup migration: journey_steps.is_completion_step column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: is_completion_step column add failed (non-fatal)");
  }

  // ── Rooms tables (2026-07) ───────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name         TEXT NOT NULL,
        invite_code  CHAR(7) NOT NULL UNIQUE,
        invite_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        created_by   TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS room_members (
        room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (room_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS room_members_room_id_idx ON room_members(room_id);
      CREATE INDEX IF NOT EXISTS room_members_user_id_idx ON room_members(user_id);

      CREATE TABLE IF NOT EXISTS room_messages (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS room_messages_room_id_idx ON room_messages(room_id);

      CREATE TABLE IF NOT EXISTS room_journeys (
        room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        journey_id TEXT NOT NULL,
        started_by TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (room_id, journey_id)
      );

      CREATE INDEX IF NOT EXISTS room_journeys_room_id_idx ON room_journeys(room_id);
    `);
    logger.info("Startup migration: rooms tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: rooms tables failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''
    `);
    logger.info("Startup migration: rooms.description column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: rooms.description column failed (non-fatal)");
  }

  // ── Walk theme_color and version columns (2026-07) ───────────────────────────
  try {
    await pool.query(`
      ALTER TABLE journeys
        ADD COLUMN IF NOT EXISTS theme_color VARCHAR(7),
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    `);
    logger.info("Startup migration: journeys.theme_color + version columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: journeys.theme_color / version columns failed (non-fatal)");
  }

  // ── Walk hide-from-today (2026-08) ───────────────────────────────────────────
  try {
    await pool.query(`
      ALTER TABLE user_journey_progress
        ADD COLUMN IF NOT EXISTS hidden_from_today boolean NOT NULL DEFAULT false;
    `);
    logger.info("Startup migration: user_journey_progress.hidden_from_today column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: user_journey_progress.hidden_from_today column failed (non-fatal)");
  }

  // ── Smart Content Indicators — notify_published_at + last_opened_at (2026-07) ──
  // IMPORTANT: must run before repairStepStatuses which queries the journeys table
  // via Drizzle (which now includes notify_published_at in the SELECT).
  {
    const badgeAlters = [
      `ALTER TABLE journeys                  ADD COLUMN IF NOT EXISTS notify_published_at timestamptz`,
      `ALTER TABLE devotional_series         ADD COLUMN IF NOT EXISTS notify_published_at timestamptz`,
      `ALTER TABLE sermon_companion          ADD COLUMN IF NOT EXISTS notify_published_at timestamptz`,
      `ALTER TABLE user_journey_progress     ADD COLUMN IF NOT EXISTS last_opened_at timestamptz`,
      `ALTER TABLE devotional_progress       ADD COLUMN IF NOT EXISTS last_opened_at timestamptz`,
      `ALTER TABLE sermon_companion_progress ADD COLUMN IF NOT EXISTS last_opened_at timestamptz`,
    ];
    for (const sql of badgeAlters) {
      try {
        await pool.query(sql);
      } catch (err) {
        logger.warn({ err, sql }, "Startup migration: badge column alter failed (non-fatal)");
      }
    }
    logger.info("Startup migration: Smart Content Indicator columns ensured (idempotent)");
  }

  // ── user_journey_progress unique constraint (2026-07) ─────────────────────────
  // Creates a UNIQUE INDEX on (user_id, journey_id) so the atomic shared-start
  // endpoint works correctly.
  //
  // PREREQUISITE for fresh databases: if the target database was created before
  // this index existed and still has duplicate (user_id, journey_id) rows,
  // run the maintenance script first:
  //   pnpm --filter @workspace/api-server run repair:progress-duplicates
  // If duplicates exist, CREATE UNIQUE INDEX will fail and the shared-start
  // endpoint will return 503 until the duplicates are resolved. This is the
  // correct safe behaviour — the endpoint requires the uniqueness guarantee.
  //
  // Multi-instance safety: a pg_advisory_lock serializes the index-create step
  // across all API processes booting simultaneously.
  const ADVISORY_LOCK_KEY = 7_391_852;
  const migClient = await pool.connect();
  try {
    await migClient.query(`SELECT pg_advisory_lock($1)`, [ADVISORY_LOCK_KEY]);
    try {
      // Create the unique index. IF NOT EXISTS makes this a no-op on all boots
      // after the first successful run.
      await migClient.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_journey_progress_user_journey
          ON user_journey_progress (user_id, journey_id)
      `);

      // Verify the index is present and valid before enabling the endpoint.
      const verifyRes = await migClient.query(`
        SELECT 1
          FROM pg_index i
          JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relname = 'uidx_user_journey_progress_user_journey'
           AND i.indisunique = true
           AND i.indisvalid  = true
      `);

      if (verifyRes.rows.length > 0) {
        setStartSharedReady();
        logger.info("Startup migration: user_journey_progress unique index verified and active — start-shared endpoint active");
      } else {
        logger.error("Startup migration: unique index exists but catalog reports it as invalid or non-unique — start-shared endpoint will return 503");
      }
    } finally {
      await migClient.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "Startup migration: user_journey_progress unique index FAILED — start-shared endpoint will return 503 until resolved");
  } finally {
    migClient.release();
  }

  // ── Bible: persistent user annotation storage (2026-07) ────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_bible_data (
        user_id   text PRIMARY KEY,
        data      jsonb NOT NULL DEFAULT '{}',
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    logger.info("Startup migration: user_bible_data table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: user_bible_data table failed (non-fatal)");
  }

  // ── Bible: cross references (2026-07) ─────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bible_cross_references (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        from_book_id      text NOT NULL,
        from_chapter      int  NOT NULL,
        from_verse        int  NOT NULL,
        to_book_id        text NOT NULL,
        to_chapter        int  NOT NULL,
        to_verse          int  NOT NULL,
        relationship_note text NOT NULL DEFAULT '',
        created_by        text NOT NULL DEFAULT '',
        created_at        timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS bible_cross_refs_from_idx
        ON bible_cross_references(from_book_id, from_chapter, from_verse);
      CREATE INDEX IF NOT EXISTS bible_cross_refs_to_idx
        ON bible_cross_references(to_book_id, to_chapter, to_verse);
    `);
    logger.info("Startup migration: bible_cross_references table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_cross_references table failed (non-fatal)");
  }

  // ── Bible: admin study notes (2026-07) ─────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bible_study_notes (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id               text NOT NULL,
        chapter               int  NOT NULL,
        verse_start           int  NOT NULL,
        verse_end             int,
        title                 text NOT NULL DEFAULT '',
        content               text NOT NULL DEFAULT '',
        context_note          text NOT NULL DEFAULT '',
        historical_note       text NOT NULL DEFAULT '',
        original_language_note text NOT NULL DEFAULT '',
        jesus_connection      text NOT NULL DEFAULT '',
        apply_it              text NOT NULL DEFAULT '',
        status                text NOT NULL DEFAULT 'Draft'
          CHECK (status IN ('Draft','In Review','Published','Archived')),
        created_by            text NOT NULL DEFAULT '',
        updated_by            text NOT NULL DEFAULT '',
        created_at            timestamp NOT NULL DEFAULT now(),
        updated_at            timestamp NOT NULL DEFAULT now()
      )
    `);
    logger.info("Startup migration: bible_study_notes table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_study_notes table failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE bible_study_notes
        ADD COLUMN IF NOT EXISTS cross_references       jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS key_themes             jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS important_people       jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS important_places       jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS source_records         jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS psalm_metadata         jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS note_type              text  NOT NULL DEFAULT 'passage'
    `);
    logger.info("Startup migration: bible_study_notes extended columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_study_notes column extension failed (non-fatal)");
  }

  try {
    await pool.query(`
      ALTER TABLE bible_study_notes
        ADD COLUMN IF NOT EXISTS key_truth            text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS reflection_question  text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS related_scriptures   text NOT NULL DEFAULT ''
    `);
    logger.info("Startup migration: bible_study_notes authoring columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_study_notes authoring columns failed (non-fatal)");
  }

  // ── Bible: study-notes unique index (2026-07) ─────────────────────────────
  // Required for ON CONFLICT (book_id, chapter, verse_start) in the generate
  // endpoint. Safe to re-run (CREATE UNIQUE INDEX IF NOT EXISTS).
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_bible_study_notes_book_chapter_verse
        ON bible_study_notes (book_id, chapter, verse_start)
    `);
    logger.info("Startup migration: bible_study_notes unique index ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_study_notes unique index failed (non-fatal)");
  }

  // ── Bible: book introductions (2026-07) ────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bible_book_introductions (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id             text NOT NULL UNIQUE,
        book_name           text NOT NULL DEFAULT '',
        testament           text NOT NULL DEFAULT '',
        genre               text NOT NULL DEFAULT '',
        author_attribution  text NOT NULL DEFAULT '',
        date_range          text NOT NULL DEFAULT '',
        original_audience   text NOT NULL DEFAULT '',
        historical_setting  text NOT NULL DEFAULT '',
        purpose             text NOT NULL DEFAULT '',
        major_themes        jsonb NOT NULL DEFAULT '[]',
        key_people          jsonb NOT NULL DEFAULT '[]',
        key_places          jsonb NOT NULL DEFAULT '[]',
        outline             jsonb NOT NULL DEFAULT '[]',
        key_passages        jsonb NOT NULL DEFAULT '[]',
        points_to_jesus     text NOT NULL DEFAULT '',
        interpretation_notes text NOT NULL DEFAULT '',
        status              text NOT NULL DEFAULT 'Draft'
          CHECK (status IN ('Draft','In Review','Published','Archived')),
        created_by          text NOT NULL DEFAULT '',
        updated_by          text NOT NULL DEFAULT '',
        created_at          timestamp NOT NULL DEFAULT now(),
        updated_at          timestamp NOT NULL DEFAULT now()
      )
    `);
    logger.info("Startup migration: bible_book_introductions table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_book_introductions table failed (non-fatal)");
  }

  // ── Bible: chapter overviews (2026-07) ─────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bible_chapter_overviews (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id             text NOT NULL,
        chapter             int  NOT NULL,
        UNIQUE (book_id, chapter),
        summary             text NOT NULL DEFAULT '',
        main_themes         jsonb NOT NULL DEFAULT '[]',
        important_people    jsonb NOT NULL DEFAULT '[]',
        important_locations jsonb NOT NULL DEFAULT '[]',
        passage_divisions   jsonb NOT NULL DEFAULT '[]',
        key_verse           text NOT NULL DEFAULT '',
        key_verse_start     int,
        key_verse_end       int,
        book_connection     text NOT NULL DEFAULT '',
        jesus_connection    text NOT NULL DEFAULT '',
        status              text NOT NULL DEFAULT 'Draft'
          CHECK (status IN ('Draft','In Review','Published','Archived')),
        created_by          text NOT NULL DEFAULT '',
        updated_by          text NOT NULL DEFAULT '',
        created_at          timestamp NOT NULL DEFAULT now(),
        updated_at          timestamp NOT NULL DEFAULT now()
      )
    `);
    logger.info("Startup migration: bible_chapter_overviews table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: bible_chapter_overviews table failed (non-fatal)");
  }

  // ── Today's Steps: hide-from-today flag on devotional progress (2026-08) ──────
  try {
    await pool.query(`
      ALTER TABLE devotional_progress
        ADD COLUMN IF NOT EXISTS hidden_from_today BOOLEAN NOT NULL DEFAULT FALSE
    `);
    logger.info("Startup migration: devotional_progress.hidden_from_today column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: devotional_progress.hidden_from_today failed (non-fatal)");
  }

  // ── Today's Steps: hide-from-today flag on sermon companion progress (2026-08) ─
  try {
    await pool.query(`
      ALTER TABLE sermon_companion_progress
        ADD COLUMN IF NOT EXISTS hidden_from_today BOOLEAN NOT NULL DEFAULT FALSE
    `);
    logger.info("Startup migration: sermon_companion_progress.hidden_from_today column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: sermon_companion_progress.hidden_from_today failed (non-fatal)");
  }

  // ── Content audit log table + deleted_at soft-delete columns (2026-08) ─────────
  // content_audit_log records every admin mutation. deleted_at columns allow
  // soft deletes for journeys and steps so content can be recovered if needed.
  {
    const auditDDL = [
      `CREATE TABLE IF NOT EXISTS content_audit_log (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content_type   TEXT NOT NULL,
        content_id     TEXT NOT NULL,
        action         TEXT NOT NULL,
        performed_by   TEXT NOT NULL,
        performed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        previous_state JSONB,
        new_state      JSONB
      )`,
      `CREATE INDEX IF NOT EXISTS idx_content_audit_log_content
         ON content_audit_log (content_type, content_id)`,
      `CREATE INDEX IF NOT EXISTS idx_content_audit_log_performed_at
         ON content_audit_log (performed_at DESC)`,
      `ALTER TABLE journeys               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      `ALTER TABLE journey_steps          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      // Devotional and sermon companion soft-delete columns are intentionally
      // deferred until filtering is also implemented in their store modules.
      // (see tasks #283, #285 for the follow-up work)
    ];
    for (const ddl of auditDDL) {
      try {
        await pool.query(ddl);
      } catch (err) {
        logger.warn({ err }, "Startup migration: audit DDL step failed (non-fatal)");
      }
    }
    logger.info("Startup migration: content_audit_log + deleted_at columns ensured (idempotent)");
  }

  // ── Canonical Sermons table (2026-08) ────────────────────────────────────────
  // Replaces the file-backed admin-drafts.json with a proper DB table.
  // sermon_companion.sermon_uuid FK added here to link companion → canonical sermon.
  // NOTE: sermon_id (text) on sermon_companion is kept for legacy compatibility.
  {
    const sermonsDDL = [
      `CREATE TABLE IF NOT EXISTS sermons (
         id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         legacy_json_id      TEXT,
         title               TEXT NOT NULL DEFAULT '',
         speaker             TEXT NOT NULL DEFAULT '',
         sermon_date         TEXT NOT NULL DEFAULT '',
         series              TEXT NOT NULL DEFAULT '',
         scripture_reference TEXT NOT NULL DEFAULT '',
         scripture_book_ids  JSONB NOT NULL DEFAULT '[]',
         scripture_chapters  JSONB NOT NULL DEFAULT '[]',
         youtube_url         TEXT NOT NULL DEFAULT '',
         youtube_video_id    TEXT NOT NULL DEFAULT '',
         audio_path          TEXT NOT NULL DEFAULT '',
         notes               TEXT NOT NULL DEFAULT '',
         transcript          TEXT NOT NULL DEFAULT '',
         transcript_status   TEXT NOT NULL DEFAULT 'none',
         summary             TEXT NOT NULL DEFAULT '',
         themes              JSONB NOT NULL DEFAULT '[]',
         sections            JSONB NOT NULL DEFAULT '[]',
         keywords            JSONB NOT NULL DEFAULT '[]',
         main_theme          TEXT NOT NULL DEFAULT '',
         status              TEXT NOT NULL DEFAULT 'Draft',
         published_at        TIMESTAMPTZ,
         created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      // Drop any previously-created partial index and replace with a full unique
      // index so ON CONFLICT (legacy_json_id) works without a WHERE clause.
      // PostgreSQL allows multiple NULLs in a non-partial unique index (safe).
      `DROP INDEX IF EXISTS sermons_legacy_json_id_idx`,
      `CREATE UNIQUE INDEX IF NOT EXISTS sermons_legacy_json_id_idx
         ON sermons (legacy_json_id)`,
      `CREATE INDEX IF NOT EXISTS sermons_status_idx ON sermons (status)`,
      `CREATE INDEX IF NOT EXISTS sermons_published_at_idx ON sermons (published_at DESC)`,
      // FK from sermon_companion to the new canonical table (nullable during migration)
      `ALTER TABLE sermon_companion
         ADD COLUMN IF NOT EXISTS sermon_uuid UUID REFERENCES sermons(id)`,
    ];
    for (const ddl of sermonsDDL) {
      try {
        await pool.query(ddl);
      } catch (err) {
        logger.warn({ err }, "Startup migration: sermons DDL step failed (non-fatal)");
      }
    }
    logger.info("Startup migration: sermons table + sermon_companion.sermon_uuid ensured (idempotent)");
  }

  // ── Sermon detection metadata columns (2026-08) ───────────────────────────────
  // Stores the full recording transcript, sermon boundary times, and AI
  // detection fields so the editor can re-detect without losing the original data.
  {
    const detectionDDL = [
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS full_transcript TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS sermon_start_time TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS sermon_end_time TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS detection_confidence FLOAT NOT NULL DEFAULT 0`,
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS detection_method TEXT NOT NULL DEFAULT 'none'`,
    ];
    for (const ddl of detectionDDL) {
      try { await pool.query(ddl); } catch (err) {
        logger.warn({ err }, "Startup migration: sermon detection column DDL step failed (non-fatal)");
      }
    }
    logger.info("Startup migration: sermon detection metadata columns ensured (idempotent)");
  }

  // ── Sermon processing stage columns (2026-08) ────────────────────────────────
  // Tracks background processing pipeline state so the admin UI can poll for
  // progress without a separate jobs table. processingStage values:
  //   idle | transcribing | generating | complete | failed:transcribing | failed:generating
  {
    const processingDDL = [
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS processing_stage TEXT NOT NULL DEFAULT 'idle'`,
      `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS processing_error TEXT NOT NULL DEFAULT ''`,
    ];
    for (const ddl of processingDDL) {
      try { await pool.query(ddl); } catch (err) {
        logger.warn({ err }, "Startup migration: sermon processing column DDL step failed (non-fatal)");
      }
    }
    logger.info("Startup migration: sermon processing stage columns ensured (idempotent)");
  }

  // ── Emmaus Knowledge Index (2026-08) ─────────────────────────────────────────
  // Stores enriched sermon + companion data so Ask Emmaus and search can match
  // on step content, prayer themes, and teaching points — not just the top-level
  // sermon metadata on the canonical sermons table.
  // Upserted automatically when a companion or sermon is published.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emmaus_knowledge_index (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sermon_id           TEXT NOT NULL UNIQUE,
        companion_id        UUID,
        title               TEXT NOT NULL DEFAULT '',
        speaker             TEXT NOT NULL DEFAULT '',
        sermon_date         TEXT NOT NULL DEFAULT '',
        series              TEXT NOT NULL DEFAULT '',
        scripture_reference TEXT NOT NULL DEFAULT '',
        scripture_book_ids  JSONB NOT NULL DEFAULT '[]',
        scripture_chapters  JSONB NOT NULL DEFAULT '[]',
        themes              JSONB NOT NULL DEFAULT '[]',
        keywords            JSONB NOT NULL DEFAULT '[]',
        main_theme          TEXT NOT NULL DEFAULT '',
        summary             TEXT NOT NULL DEFAULT '',
        step_titles         JSONB NOT NULL DEFAULT '[]',
        step_content        TEXT NOT NULL DEFAULT '',
        prayer_themes       TEXT NOT NULL DEFAULT '',
        youtube_url         TEXT NOT NULL DEFAULT '',
        audio_path          TEXT NOT NULL DEFAULT '',
        published_at        TIMESTAMPTZ,
        indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("Startup migration: emmaus_knowledge_index table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: emmaus_knowledge_index table failed (non-fatal)");
  }

  // ── emmaus_knowledge_index: full-text search column + GIN index (2026-08) ────
  // Adds a generated tsvector column so searchKnowledgeIndex can pre-filter rows
  // in Postgres rather than fetching every row into Node.js memory.
  // keywords is JSONB — casting to text produces searchable tokens e.g. ["faith","grace"].
  // ADD COLUMN IF NOT EXISTS is a no-op on subsequent boots (idempotent).
  try {
    await pool.query(`
      ALTER TABLE emmaus_knowledge_index
        ADD COLUMN IF NOT EXISTS content_tsv tsvector
          GENERATED ALWAYS AS (
            to_tsvector('english',
              coalesce(title, '') || ' ' ||
              coalesce(main_theme, '') || ' ' ||
              coalesce(step_content, '') || ' ' ||
              coalesce(prayer_themes, '') || ' ' ||
              coalesce(keywords::text, '')
            )
          ) STORED
    `);
    logger.info("Startup migration: emmaus_knowledge_index.content_tsv column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: emmaus_knowledge_index.content_tsv column failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emmaus_knowledge_index_content_tsv
        ON emmaus_knowledge_index USING gin(content_tsv)
    `);
    logger.info("Startup migration: emmaus_knowledge_index GIN index ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: emmaus_knowledge_index GIN index failed (non-fatal)");
  }

  // ── Content safety assertion ──────────────────────────────────────────────────
  // Logs a count of authored content rows on every boot. This creates a visible
  // audit trail in server logs proving that startup migrations did not mutate
  // authored content. Monitor these counts in production after every deployment.
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM journeys)                  AS journeys,
        (SELECT COUNT(*) FROM journey_steps)             AS journey_steps,
        (SELECT COUNT(*) FROM devotional_series)         AS devotional_series,
        (SELECT COUNT(*) FROM devotional_entries)        AS devotional_entries,
        (SELECT COUNT(*) FROM sermon_companion)          AS sermon_companions,
        (SELECT COUNT(*) FROM bible_study_notes)         AS bible_study_notes
    `);
    const row = counts.rows[0];
    logger.info(
      {
        journeys:         Number(row.journeys),
        journeySteps:     Number(row.journey_steps),
        devotionalSeries: Number(row.devotional_series),
        devotionalEntries:Number(row.devotional_entries),
        sermonCompanions: Number(row.sermon_companions),
        bibleStudyNotes:  Number(row.bible_study_notes),
      },
      "Startup migration: content inventory (no mutations — schema DDL only)"
    );
  } catch (err) {
    logger.warn({ err }, "Startup migration: content inventory check failed (non-fatal)");
  }

  // ── Pastoral Care — Phase 1 tables ───────────────────────────────────────

  try {
    await pool.query(`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS pastoral_role TEXT;
    `);
    logger.info("Startup migration: user_profiles.pastoral_role column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: user_profiles.pastoral_role failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pastoral_persons (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id    TEXT        NOT NULL DEFAULT 'icc',
        full_name    TEXT        NOT NULL,
        display_name TEXT        NOT NULL DEFAULT '',
        email        TEXT,
        phone        TEXT,
        linked_user_id TEXT,
        person_type  TEXT        NOT NULL DEFAULT 'attendance_only'
                     CHECK (person_type IN ('attendance_only','visitor')),
        notes        TEXT        NOT NULL DEFAULT '',
        is_active    BOOLEAN     NOT NULL DEFAULT true,
        created_by   TEXT        NOT NULL DEFAULT '',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (church_id, linked_user_id)
      );
      CREATE INDEX IF NOT EXISTS pastoral_persons_church_idx
        ON pastoral_persons (church_id);
      CREATE INDEX IF NOT EXISTS pastoral_persons_linked_user_idx
        ON pastoral_persons (linked_user_id)
        WHERE linked_user_id IS NOT NULL;
    `);
    logger.info("Startup migration: pastoral_persons table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: pastoral_persons table failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_types (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id            TEXT        NOT NULL DEFAULT 'icc',
        name                 TEXT        NOT NULL,
        category             TEXT        NOT NULL DEFAULT 'general',
        description          TEXT        NOT NULL DEFAULT '',
        usual_day            TEXT,
        usual_time           TEXT,
        responsible_ministry TEXT,
        is_active            BOOLEAN     NOT NULL DEFAULT true,
        track_attendance     BOOLEAN     NOT NULL DEFAULT true,
        care_signal_enabled  BOOLEAN     NOT NULL DEFAULT false,
        is_sensitive         BOOLEAN     NOT NULL DEFAULT false,
        created_by           TEXT        NOT NULL DEFAULT '',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS meeting_types_church_idx
        ON meeting_types (church_id, is_active);
    `);
    logger.info("Startup migration: meeting_types table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: meeting_types table failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_sessions (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id       TEXT        NOT NULL DEFAULT 'icc',
        meeting_type_id UUID        NOT NULL REFERENCES meeting_types(id),
        session_date    DATE        NOT NULL,
        start_time      TEXT,
        location        TEXT        NOT NULL DEFAULT '',
        notes           TEXT        NOT NULL DEFAULT '',
        status          TEXT        NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','completed','cancelled')),
        created_by      TEXT        NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS meeting_sessions_church_date_idx
        ON meeting_sessions (church_id, session_date DESC);
      CREATE INDEX IF NOT EXISTS meeting_sessions_type_idx
        ON meeting_sessions (meeting_type_id);
    `);
    logger.info("Startup migration: meeting_sessions table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: meeting_sessions table failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id   TEXT        NOT NULL DEFAULT 'icc',
        session_id  UUID        NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
        person_id   TEXT        NOT NULL,
        person_type TEXT        NOT NULL
                    CHECK (person_type IN ('emmaus_user','pastoral_person')),
        status      TEXT        NOT NULL
                    CHECK (status IN ('present','visitor','apology','absent','not_expected')),
        recorded_by TEXT        NOT NULL DEFAULT '',
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by  TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (session_id, person_id, person_type)
      );
      CREATE INDEX IF NOT EXISTS attendance_records_session_idx
        ON attendance_records (session_id);
      CREATE INDEX IF NOT EXISTS attendance_records_person_idx
        ON attendance_records (person_id, person_type);
      CREATE INDEX IF NOT EXISTS attendance_records_status_idx
        ON attendance_records (church_id, status);
    `);
    logger.info("Startup migration: attendance_records table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: attendance_records table failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS person_attendance_expectations (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id       TEXT        NOT NULL DEFAULT 'icc',
        person_id       TEXT        NOT NULL,
        person_type     TEXT        NOT NULL
                        CHECK (person_type IN ('emmaus_user','pastoral_person')),
        meeting_type_id UUID        NOT NULL REFERENCES meeting_types(id) ON DELETE CASCADE,
        expectation     TEXT        NOT NULL DEFAULT 'expected'
                        CHECK (expectation IN ('expected','not_expected')),
        notes           TEXT        NOT NULL DEFAULT '',
        created_by      TEXT        NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (person_id, person_type, meeting_type_id)
      );
      CREATE INDEX IF NOT EXISTS expectations_person_idx
        ON person_attendance_expectations (person_id, person_type);
    `);
    logger.info("Startup migration: person_attendance_expectations table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: person_attendance_expectations table failed (non-fatal)");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pastoral_audit_log (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id      TEXT        NOT NULL DEFAULT 'icc',
        entity_type    TEXT        NOT NULL,
        entity_id      TEXT        NOT NULL,
        action         TEXT        NOT NULL,
        person_id      TEXT,
        session_id     TEXT,
        previous_value JSONB,
        new_value      JSONB,
        changed_by     TEXT        NOT NULL DEFAULT '',
        changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason         TEXT        NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS pastoral_audit_log_entity_idx
        ON pastoral_audit_log (entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS pastoral_audit_log_person_idx
        ON pastoral_audit_log (person_id)
        WHERE person_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS pastoral_audit_log_changed_at_idx
        ON pastoral_audit_log (changed_at DESC);
    `);
    logger.info("Startup migration: pastoral_audit_log table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: pastoral_audit_log table failed (non-fatal)");
  }

  // ── Pastoral Care — Phase 3: care_signals table (2026-08) ────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_signals (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id      TEXT        NOT NULL DEFAULT 'icc',
        person_id      TEXT        NOT NULL,
        person_type    TEXT        NOT NULL
                       CHECK (person_type IN ('emmaus_user','pastoral_person')),
        trigger        TEXT        NOT NULL DEFAULT 'missed_session',
        session_id     UUID        NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
        auto_dismissed BOOLEAN     NOT NULL DEFAULT false,
        dismissed_at   TIMESTAMPTZ,
        dismissed_by   TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (person_id, person_type, session_id)
      );
      CREATE INDEX IF NOT EXISTS care_signals_church_idx
        ON care_signals (church_id, dismissed_at)
        WHERE dismissed_at IS NULL;
      CREATE INDEX IF NOT EXISTS care_signals_person_idx
        ON care_signals (person_id, person_type);
      CREATE INDEX IF NOT EXISTS care_signals_session_idx
        ON care_signals (session_id);
    `);
    logger.info("Startup migration: care_signals table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: care_signals table failed (non-fatal)");
  }

  // ── Pastoral Care — Phase 4: pastoral_milestones table (2026-08-CP3) ───────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pastoral_milestones (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id      TEXT        NOT NULL DEFAULT 'icc',
        person_id      TEXT        NOT NULL,
        person_type    TEXT        NOT NULL
                       CHECK (person_type IN ('emmaus_user','pastoral_person')),
        milestone_type TEXT        NOT NULL DEFAULT 'other',
        title          TEXT        NOT NULL,
        milestone_date DATE,
        notes          TEXT,
        is_active      BOOLEAN     NOT NULL DEFAULT true,
        created_by     TEXT        NOT NULL DEFAULT '',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pastoral_milestones_person_idx
        ON pastoral_milestones (church_id, person_id, person_type)
        WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS pastoral_milestones_date_idx
        ON pastoral_milestones (milestone_date DESC NULLS LAST)
        WHERE is_active = true;
    `);
    logger.info("Startup migration: pastoral_milestones table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: pastoral_milestones table failed (non-fatal)");
  }

  // ── Pastoral Care — Phase 5: discipleship_signals table (CP4) ───────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discipleship_signals (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        church_id     TEXT        NOT NULL DEFAULT 'icc',
        person_id     TEXT        NOT NULL,
        person_type   TEXT        NOT NULL
                      CHECK (person_type IN ('emmaus_user','pastoral_person')),
        category      TEXT        NOT NULL
                      CHECK (category IN ('celebration','growth','attention','follow_up','significant')),
        signal_type   TEXT        NOT NULL,
        title         TEXT        NOT NULL,
        explanation   TEXT        NOT NULL DEFAULT '',
        evidence      JSONB       NOT NULL DEFAULT '{}',
        status        TEXT        NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','acknowledged','following_up','resolved','dismissed')),
        assigned_to   TEXT,
        pastoral_note TEXT,
        detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (church_id, person_id, person_type, signal_type)
      );
      CREATE INDEX IF NOT EXISTS disc_signals_church_status_idx
        ON discipleship_signals (church_id, status, detected_at DESC);
      CREATE INDEX IF NOT EXISTS disc_signals_person_idx
        ON discipleship_signals (church_id, person_id, person_type);
      CREATE INDEX IF NOT EXISTS disc_signals_category_idx
        ON discipleship_signals (church_id, category, status, detected_at DESC);
    `);
    logger.info("Startup migration: discipleship_signals table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: discipleship_signals table failed (non-fatal)");
  }

  // ── ffmpeg health check ───────────────────────────────────────────────────
  // Uses the FFMPEG_BIN resolved by audio-transcription.ts (which tries
  // ffmpeg-static first, then PATH, then falls back to bare "ffmpeg").
  // Logs the absolute path + version on success.
  // Logs a hard error if unavailable so the issue is visible in deployment logs
  // before any admin attempts to run a sermon through the pipeline.
  if (!FFMPEG_AVAILABLE) {
    logger.error(
      { bin: FFMPEG_BIN },
      "Startup: ffmpeg NOT available — sermon audio processing will fail. " +
      "Ensure ffmpeg-static is in production dependencies and onlyBuiltDependencies.",
    );
  } else {
    try {
      const { execSync } = await import("node:child_process");
      const versionLine = execSync(`"${FFMPEG_BIN}" -version`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).split("\n")[0]?.trim() ?? "";
      logger.info(
        { bin: FFMPEG_BIN, version: versionLine },
        "Startup: ffmpeg available",
      );
    } catch (ffErr) {
      logger.error(
        { err: ffErr, bin: FFMPEG_BIN },
        "Startup: ffmpeg binary found but -version failed — check binary integrity",
      );
    }
  }
}
