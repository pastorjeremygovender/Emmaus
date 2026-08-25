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
  // Presentation ordering columns are additive and intentionally have no data
  // mutations here. Legacy rows remain stable via created_at/day fallbacks.
  for (const statement of [
    `ALTER TABLE journeys ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0`,
    `ALTER TABLE journey_steps ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0`,
    `ALTER TABLE devotional_series ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0`,
    `ALTER TABLE devotional_entries ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0`,
    `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0`,
    `ALTER TABLE sermon_companion ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS youtube_archive_state (
      state_key text PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  ]) {
    try { await pool.query(statement); } catch (err) {
      logger.warn({ err, statement }, "Startup migration: display order column failed (non-fatal)");
    }
  }
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

      CREATE TABLE IF NOT EXISTS devotional_entry_groups (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        series_id     uuid NOT NULL REFERENCES devotional_series(id) ON DELETE CASCADE,
        title         text NOT NULL,
        description   text DEFAULT '',
        status        text NOT NULL DEFAULT 'Draft',
        display_order integer NOT NULL DEFAULT 0,
        created_at    timestamp NOT NULL DEFAULT NOW(),
        updated_at    timestamp NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS devotional_entry_group_items (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id      uuid NOT NULL REFERENCES devotional_entry_groups(id) ON DELETE CASCADE,
        entry_id      uuid NOT NULL REFERENCES devotional_entries(id) ON DELETE CASCADE,
        display_order integer NOT NULL DEFAULT 0,
        created_at    timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (group_id, entry_id)
      );
      CREATE INDEX IF NOT EXISTS devotional_entry_groups_series_idx
        ON devotional_entry_groups(series_id, display_order);
      CREATE INDEX IF NOT EXISTS devotional_entry_group_items_group_idx
        ON devotional_entry_group_items(group_id, display_order);
    `);
    logger.info("Startup migration: devotional tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: devotional tables failed (non-fatal)");
  }

  // ── Daily Rhythm day groups (2026-08) ─────────────────────────────────────────
  // Schema-only migration. It never creates or changes authored memberships.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_rhythm_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        journey_id text NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text DEFAULT '',
        status text NOT NULL DEFAULT 'Draft',
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS daily_rhythm_group_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id uuid NOT NULL REFERENCES daily_rhythm_groups(id) ON DELETE CASCADE,
        step_id uuid NOT NULL REFERENCES journey_steps(id) ON DELETE CASCADE,
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (group_id, step_id)
      );
      CREATE INDEX IF NOT EXISTS daily_rhythm_groups_journey_idx
        ON daily_rhythm_groups(journey_id, display_order);
      CREATE INDEX IF NOT EXISTS daily_rhythm_group_items_group_idx
        ON daily_rhythm_group_items(group_id, display_order);
    `);
    logger.info("Startup migration: daily rhythm group tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: daily rhythm group tables failed (non-fatal)");
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

  // ── Rooms four-level architecture columns (2026-08) ─────────────────────────
  try {
    await pool.query(`
      ALTER TABLE rooms
        ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'personal',
        ADD COLUMN IF NOT EXISTS linked_content_id   TEXT,
        ADD COLUMN IF NOT EXISTS linked_content_type TEXT;
    `);
    logger.info("Startup migration: rooms architecture columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: rooms architecture columns failed (non-fatal)");
  }

  // ── Groups V2: migrate legacy room_type values (must run after room_type column exists) ──
  // The RoomType enum changed from (personal/ministry/leadership/church_service)
  // to (personal/family/friends/marriage/discipleship/leadership/church).
  // Remap the two removed values to the closest V2 equivalent so existing
  // rooms still load correctly and are not left in an undefined type state.
  // Placed immediately after ADD COLUMN room_type to guarantee the column exists.
  try {
    await pool.query(`
      UPDATE rooms
      SET room_type = CASE
        WHEN room_type = 'ministry'       THEN 'discipleship'
        WHEN room_type = 'church_service' THEN 'church'
        ELSE room_type
      END
      WHERE room_type IN ('ministry', 'church_service');
    `);
    logger.info("Startup migration: legacy room_type values migrated to V2 equivalents (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: legacy room_type migration failed (non-fatal)");
  }

  // ── Church video settings (2026-08) ─────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS church_video_settings (
        id                       SERIAL PRIMARY KEY,
        video_enabled            BOOLEAN NOT NULL DEFAULT false,
        max_concurrent_rooms     INTEGER NOT NULL DEFAULT 5,
        max_participants_per_room INTEGER NOT NULL DEFAULT 20,
        max_duration_minutes     INTEGER NOT NULL DEFAULT 120,
        allowed_roles            TEXT[]  NOT NULL DEFAULT ARRAY['group_leader','pastor','admin','superAdmin'],
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO church_video_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
    logger.info("Startup migration: church_video_settings table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: church_video_settings table failed (non-fatal)");
  }

  // ── Rooms video session columns (2026-08) ────────────────────────────────────
  try {
    await pool.query(`
      ALTER TABLE rooms
        ADD COLUMN IF NOT EXISTS video_active      BOOLEAN   NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS video_started_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS video_started_by  TEXT,
        ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
    `);
    logger.info("Startup migration: rooms video session columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: rooms video session columns failed (non-fatal)");
  }

  // ── Room prayer requests (2026-08 V1 architecture) ───────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_prayer_requests (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        request     TEXT NOT NULL,
        is_answered BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS room_prayer_requests_room_idx
        ON room_prayer_requests(room_id);
    `);
    logger.info("Startup migration: room_prayer_requests table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_prayer_requests failed (non-fatal)");
  }

  // ── rooms.content_type column (2026-08 dual-dimension architecture) ─────────
  try {
    await pool.query(`
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS content_type TEXT;
    `);
    logger.info("Startup migration: rooms.content_type column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: rooms.content_type failed (non-fatal)");
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

  // ── Daily Rhythm server-authoritative progression (2026-08) ────────────────
  try {
    await pool.query(`
      ALTER TABLE user_journey_progress
        ADD COLUMN IF NOT EXISTS daily_rhythm_unlock_at timestamptz,
        ADD COLUMN IF NOT EXISTS daily_rhythm_timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
        ADD COLUMN IF NOT EXISTS last_daily_open_date text,
        ADD COLUMN IF NOT EXISTS daily_rhythm_startup_session text,
        ADD COLUMN IF NOT EXISTS daily_rhythm_startup_date text;
    `);
    logger.info("Startup migration: Daily Rhythm authority columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: Daily Rhythm authority columns failed (non-fatal)");
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

  // ── Bible: resumable AI generation queue (2026-08) ─────────────────────────
  // These tables contain job state only. Generated Bible content continues to
  // be written by the authenticated generation service as Draft.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bible_generation_jobs (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scope       text NOT NULL CHECK (scope IN ('book-intros','study-sheets','both')),
        force       boolean NOT NULL DEFAULT false,
        status      text NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued','running','paused','completed','failed')),
        total       int NOT NULL DEFAULT 0,
        completed   int NOT NULL DEFAULT 0,
        skipped     int NOT NULL DEFAULT 0,
        failed      int NOT NULL DEFAULT 0,
        created_by  text NOT NULL DEFAULT '',
        created_at  timestamp NOT NULL DEFAULT now(),
        updated_at  timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS bible_generation_items (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id      uuid NOT NULL REFERENCES bible_generation_jobs(id) ON DELETE CASCADE,
        item_type   text NOT NULL CHECK (item_type IN ('book-intro','chapter-batch')),
        book_id     text NOT NULL,
        chapter     int,
        status      text NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued','running','completed','skipped','failed')),
        attempts    int NOT NULL DEFAULT 0,
        last_error  text NOT NULL DEFAULT '',
        locked_at   timestamp,
        completed_at timestamp,
        created_at  timestamp NOT NULL DEFAULT now(),
        UNIQUE (job_id, item_type, book_id, chapter)
      );
      CREATE INDEX IF NOT EXISTS bible_generation_items_job_status_idx
        ON bible_generation_items(job_id, status);
    `);
    logger.info("Startup migration: Bible generation queue ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: Bible generation queue failed (non-fatal)");
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

  // ── Bible: bulk study import support (2026-08) ─────────────────────────────
  // TITLE belongs to the existing chapter overview record; import history is
  // operational/audit metadata, not authored Bible content.
  try {
    await pool.query(`
      ALTER TABLE bible_chapter_overviews
        ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS bible_study_import_history (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        imported_by    text NOT NULL,
        books          jsonb NOT NULL DEFAULT '[]',
        chapters       jsonb NOT NULL DEFAULT '[]',
        passage_count  int NOT NULL DEFAULT 0,
        conflict_mode  text NOT NULL
          CHECK (conflict_mode IN ('skip','replace','merge')),
        target_status  text NOT NULL
          CHECK (target_status IN ('Draft','Published')),
        status         text NOT NULL DEFAULT 'Running'
          CHECK (status IN ('Running','Completed','Partial','Failed')),
        result         jsonb NOT NULL DEFAULT '{}',
        created_at     timestamptz NOT NULL DEFAULT now(),
        completed_at   timestamptz
      );

      CREATE INDEX IF NOT EXISTS idx_bible_study_import_history_created_at
        ON bible_study_import_history (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bible_study_import_history_imported_by
        ON bible_study_import_history (imported_by, created_at DESC);
    `);
    logger.info("Startup migration: Bible bulk import schema ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: Bible bulk import schema failed (non-fatal)");
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

  // ── Pastoral Care — Phase 6: signal_engine_runs log table (nightly cron) ──
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signal_engine_runs (
        id           SERIAL PRIMARY KEY,
        church_id    TEXT NOT NULL DEFAULT 'icc',
        triggered_by TEXT NOT NULL DEFAULT 'scheduler',  -- 'scheduler' | 'manual'
        processed    INT  NOT NULL DEFAULT 0,
        created      INT  NOT NULL DEFAULT 0,
        updated      INT  NOT NULL DEFAULT 0,
        resolved     INT  NOT NULL DEFAULT 0,
        ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS signal_engine_runs_church_idx
        ON signal_engine_runs (church_id, ran_at DESC);
    `);
    logger.info("Startup migration: signal_engine_runs table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: signal_engine_runs table failed (non-fatal)");
  }

  // ── Signal Rule Config table (2026-08) ───────────────────────────────────
  // Per-church on/off toggles and numeric threshold overrides for all 18
  // care-signal rules. Keyed by (church_id, rule_id).
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signal_rule_config (
        id          uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        church_id   text          NOT NULL,
        rule_id     text          NOT NULL,
        enabled     boolean       NOT NULL DEFAULT true,
        thresholds  jsonb         NOT NULL DEFAULT '{}',
        updated_by  text          NOT NULL DEFAULT '',
        updated_at  timestamptz   NOT NULL DEFAULT NOW(),
        UNIQUE (church_id, rule_id)
      );
    `);
    logger.info("Startup migration: signal_rule_config table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: signal_rule_config table failed (non-fatal)");
  }

  // ── Ministry Tasks (CP7) ─────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ministry_tasks (
        id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        church_id    text        NOT NULL DEFAULT 'icc',
        title        text        NOT NULL,
        reason       text        NOT NULL DEFAULT '',
        person_id    text,
        person_type  text        CHECK (person_type IN ('emmaus_user','pastoral_person') OR person_type IS NULL),
        source       text        NOT NULL DEFAULT 'manual'
                                 CHECK (source IN ('care_signal','manual','attendance','walk','prayer_request')),
        priority     text        NOT NULL DEFAULT 'normal'
                                 CHECK (priority IN ('low','normal','high','urgent')),
        assigned_to  text,
        due_date     date,
        status       text        NOT NULL DEFAULT 'new'
                                 CHECK (status IN ('new','assigned','in_progress','waiting','completed','cancelled')),
        notes        text        NOT NULL DEFAULT '',
        team         text        NOT NULL DEFAULT '',
        checklist    jsonb       NOT NULL DEFAULT '[]',
        signal_id    uuid,
        created_by   text        NOT NULL DEFAULT '',
        created_at   timestamptz NOT NULL DEFAULT NOW(),
        updated_at   timestamptz NOT NULL DEFAULT NOW(),
        archived_at  timestamptz
      );
      CREATE INDEX IF NOT EXISTS ministry_tasks_church_status_idx
        ON ministry_tasks (church_id, status, due_date NULLS LAST)
        WHERE archived_at IS NULL;
      CREATE INDEX IF NOT EXISTS ministry_tasks_assigned_idx
        ON ministry_tasks (assigned_to, due_date NULLS LAST)
        WHERE archived_at IS NULL;
      CREATE INDEX IF NOT EXISTS ministry_tasks_person_idx
        ON ministry_tasks (person_id, person_type)
        WHERE archived_at IS NULL;
    `);
    logger.info("Startup migration: ministry_tasks table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: ministry_tasks table failed (non-fatal)");
  }

  // ── Task Templates (CP7) ─────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        church_id           text        NOT NULL DEFAULT 'icc',
        name                text        NOT NULL,
        category            text        NOT NULL DEFAULT '',
        default_title       text        NOT NULL DEFAULT '',
        suggested_questions text[]      NOT NULL DEFAULT '{}',
        bible_ref           text        NOT NULL DEFAULT '',
        prayer_reminder     text        NOT NULL DEFAULT '',
        checklist           jsonb       NOT NULL DEFAULT '[]',
        is_system           boolean     NOT NULL DEFAULT false,
        created_by          text        NOT NULL DEFAULT 'system',
        created_at          timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (church_id, name)
      );
    `);
    logger.info("Startup migration: task_templates table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: task_templates table failed (non-fatal)");
  }

  // ── Pastoral Workflow Notes (CP7) ─────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pastoral_workflow_notes (
        id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        church_id       text        NOT NULL DEFAULT 'icc',
        person_id       text,
        person_type     text,
        task_id         uuid,
        content         text        NOT NULL,
        is_confidential boolean     NOT NULL DEFAULT false,
        author_id       text        NOT NULL DEFAULT '',
        created_at      timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pastoral_workflow_notes_person_idx
        ON pastoral_workflow_notes (person_id, person_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS pastoral_workflow_notes_task_idx
        ON pastoral_workflow_notes (task_id, created_at DESC);
    `);
    logger.info("Startup migration: pastoral_workflow_notes table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: pastoral_workflow_notes table failed (non-fatal)");
  }

  // ── Analytics saved reports table (CP6) ──────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_saved_reports (
        id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        church_id   text        NOT NULL DEFAULT 'icc',
        name        text        NOT NULL,
        description text        NOT NULL DEFAULT '',
        config      jsonb       NOT NULL DEFAULT '{}',
        created_by  text        NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (church_id, name)
      );
      CREATE INDEX IF NOT EXISTS analytics_saved_reports_church_idx
        ON analytics_saved_reports (church_id, created_at DESC);
    `);
    logger.info("Startup migration: analytics_saved_reports table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: analytics_saved_reports table failed (non-fatal)");
  }

  // ── user_favourites + user_history tables (2026-08) ─────────────────────────
  // Universal favourites and recently-viewed history for the My Journey screen.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_favourites (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         TEXT        NOT NULL,
        content_type    TEXT        NOT NULL,
        content_id      TEXT        NOT NULL,
        content_title   TEXT        NOT NULL DEFAULT '',
        content_subtitle TEXT,
        content_route   TEXT        NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, content_type, content_id)
      );
      CREATE INDEX IF NOT EXISTS user_favourites_user_idx
        ON user_favourites (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS user_history (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       TEXT        NOT NULL,
        content_type  TEXT        NOT NULL,
        content_id    TEXT        NOT NULL,
        content_title TEXT        NOT NULL DEFAULT '',
        content_route TEXT        NOT NULL DEFAULT '',
        viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS user_history_user_time_idx
        ON user_history (user_id, viewed_at DESC);
    `);
    logger.info("Startup migration: user_favourites + user_history tables ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: user_favourites/user_history tables failed (non-fatal)");
  }

  // ── Orphan sermon companion cleanup (2026-08) ────────────────────────────────
  // Unpublish any sermon_companion that is NOT linked to a valid canonical sermon.
  // Two cases:
  //   1. sermon_uuid IS NOT NULL but the linked sermon was deleted from the sermons table.
  //   2. sermon_uuid IS NULL — legacy/pre-canonical companions with no sermon link.
  //      These cannot be served by the canonical pipeline and must not appear in member UI.
  // This ensures the member app derives its companion list exclusively from sermons
  // managed in Admin → Content Studio → Sermons. Idempotent.
  try {
    const orphanRes = await pool.query(`
      UPDATE sermon_companion
      SET    status = 'Draft', updated_at = NOW()
      WHERE  status = 'Published'
        AND (
          -- Case 1: linked sermon was deleted
          (sermon_uuid IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM sermons WHERE id = sermon_companion.sermon_uuid
          ))
          OR
          -- Case 2: no canonical sermon link at all (legacy/pre-pipeline content)
          sermon_uuid IS NULL
        )
    `);
    if (orphanRes.rowCount && orphanRes.rowCount > 0) {
      logger.warn(
        { count: orphanRes.rowCount },
        "Startup migration: unpublished orphan/unlinked sermon companions (stale or pre-canonical content)",
      );
    } else {
      logger.info("Startup migration: orphan sermon companion check — no orphans found");
    }
  } catch (err) {
    logger.warn({ err }, "Startup migration: orphan sermon companion cleanup failed (non-fatal)");
  }

  // ── authorized_room_leader permission column (2026-08) ───────────────────────
  // Explicit per-user flag that unlocks leader-only Room tools (Gather Together,
  // Guide Group, etc.). Pastors and app admins are implicitly authorized by role;
  // this column covers all other cases (e.g. an authorised youth leader who is
  // not a registered pastor).
  try {
    await pool.query(`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS authorized_room_leader BOOLEAN NOT NULL DEFAULT FALSE
    `);
    logger.info("Startup migration: user_profiles.authorized_room_leader column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: authorized_room_leader column failed (non-fatal)");
  }

  // ── Replace 'the pastor' in companion entries (2026-08) ──────────────────────
  // Generated companion entries may refer to the speaker as "the pastor" or
  // "The pastor". Replace with "Pastor Jeremy" for existing ICC content generated
  // before the speaker-name rule was introduced.
  // Uses PostgreSQL word-boundary regex (\m start-of-word, \M end-of-word).
  // Idempotent — REGEXP_REPLACE on text with no match is a no-op.
  try {
    const entryFields = ['reflection', 'greeting', 'prayer', 'next_step', 'closing', 'title'];
    for (const field of entryFields) {
      await pool.query(`
        UPDATE sermon_companion_entry
        SET    ${field} = REGEXP_REPLACE(${field}, '\\mthe pastor\\M', 'Pastor Jeremy', 'gi')
        WHERE  ${field} ~* '\\mthe pastor\\M'
      `);
    }
    logger.info("Startup migration: 'the pastor' → 'Pastor Jeremy' replacement applied to companion entries (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: 'the pastor' replacement in companion entries failed (non-fatal)");
  }

  // ── Room Sessions (Task #435 — Interactive Leader Experience) ───────────────
  // Persists active guided sessions so reconnecting members can restore state.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_sessions (
        id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        room_id             text        NOT NULL,
        started_by          text        NOT NULL,
        started_at          timestamptz NOT NULL DEFAULT NOW(),
        ended_at            timestamptz,
        status              text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','completed','ended')),
        current_mode        text        NOT NULL DEFAULT 'study'
                            CHECK (current_mode IN ('study','scripture','discussion','prayer','poll')),
        current_step        text,
        current_scripture   jsonb,
        session_plan        jsonb       NOT NULL DEFAULT '[]',
        poll                jsonb,
        metadata            jsonb       NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS room_sessions_room_id_idx
        ON room_sessions (room_id, started_at DESC);
    `);
    logger.info("Startup migration: room_sessions table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_sessions table failed (non-fatal)");
  }

  // ── Room Session Attendance (Task #435) ──────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_session_attendance (
        id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        session_id  uuid        NOT NULL,
        room_id     text        NOT NULL,
        user_id     text        NOT NULL,
        joined_at   timestamptz NOT NULL DEFAULT NOW(),
        left_at     timestamptz,
        UNIQUE (session_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS room_session_attendance_session_idx
        ON room_session_attendance (session_id, joined_at);
      CREATE INDEX IF NOT EXISTS room_session_attendance_room_user_idx
        ON room_session_attendance (room_id, user_id, joined_at DESC);
    `);
    logger.info("Startup migration: room_session_attendance table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_session_attendance table failed (non-fatal)");
  }

  // ── Room Highlights + Shared Notes (Task #436) ───────────────────────────────
  // Placed AFTER room_sessions so the FK REFERENCES room_sessions(id) is valid.
  // The DO blocks below retrofit the FK onto existing tables (idempotent).
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_highlights (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id     UUID NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
        room_id        UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id        TEXT NOT NULL,
        author_name    TEXT NOT NULL DEFAULT '',
        book           TEXT NOT NULL,
        chapter        INT  NOT NULL,
        verse          INT  NOT NULL,
        verse_text     TEXT NOT NULL DEFAULT '',
        note           TEXT,
        is_focus_verse BOOLEAN NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS room_highlights_room_session_idx
        ON room_highlights(room_id, session_id);

      CREATE TABLE IF NOT EXISTS room_shared_notes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id  UUID NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
        room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        text        TEXT NOT NULL,
        is_pinned   BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS room_shared_notes_room_session_idx
        ON room_shared_notes(room_id, session_id);

      -- Retrofit FK for databases where tables already existed without the constraint
      DO $rh$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'room_highlights_session_id_fkey' AND conrelid = 'room_highlights'::regclass
        ) THEN
          ALTER TABLE room_highlights
            ADD CONSTRAINT room_highlights_session_id_fkey
            FOREIGN KEY (session_id) REFERENCES room_sessions(id) ON DELETE CASCADE;
        END IF;
      END $rh$;

      DO $rsn$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'room_shared_notes_session_id_fkey' AND conrelid = 'room_shared_notes'::regclass
        ) THEN
          ALTER TABLE room_shared_notes
            ADD CONSTRAINT room_shared_notes_session_id_fkey
            FOREIGN KEY (session_id) REFERENCES room_sessions(id) ON DELETE CASCADE;
        END IF;
      END $rsn$;
    `);
    logger.info("Startup migration: room_highlights + room_shared_notes tables + FK ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_highlights/room_shared_notes failed (non-fatal)");
  }

  // ── Room Polls + Emmaus Answers (Task #437) ──────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_emmaus_answers (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
        room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        asked_by   TEXT NOT NULL,
        question   TEXT NOT NULL,
        answer     TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS room_emmaus_answers_session_idx
        ON room_emmaus_answers(room_id, session_id);

      CREATE TABLE IF NOT EXISTS room_polls (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id       UUID NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
        room_id          UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        created_by       TEXT NOT NULL,
        question         TEXT NOT NULL,
        poll_type        TEXT NOT NULL DEFAULT 'yes_no'
          CHECK (poll_type IN ('yes_no','multiple_choice')),
        options          JSONB NOT NULL DEFAULT '[]',
        results_revealed BOOLEAN NOT NULL DEFAULT false,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS room_polls_room_session_idx
        ON room_polls(room_id, session_id);

      CREATE TABLE IF NOT EXISTS room_poll_votes (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id      UUID NOT NULL REFERENCES room_polls(id) ON DELETE CASCADE,
        user_id      TEXT NOT NULL,
        option_index INTEGER NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (poll_id, user_id)
      );
    `);
    logger.info("Startup migration: room_polls + room_poll_votes + room_emmaus_answers tables ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_polls/room_emmaus_answers failed (non-fatal)");
  }

  // ── Room Sessions completion columns (Task #438) ─────────────────────────────
  // Stores session summary data written atomically when leader taps "Complete Session".
  try {
    await pool.query(`
      ALTER TABLE room_sessions
        ADD COLUMN IF NOT EXISTS completed_modes    JSONB NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS member_count        INTEGER,
        ADD COLUMN IF NOT EXISTS prayer_request_count INTEGER,
        ADD COLUMN IF NOT EXISTS shared_note_count   INTEGER,
        ADD COLUMN IF NOT EXISTS group_position_step TEXT;
    `);
    logger.info("Startup migration: room_sessions completion columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_sessions completion columns failed (non-fatal)");
  }

  // ── room_sessions: one-active-per-room partial unique index (Task #438) ─────
  // Prevents two concurrent startSession() calls from both creating an active
  // session for the same room (check-then-insert race).  The partial unique index
  // is the only DB-level guard; the application catches error code 23505 and
  // maps it to SESSION_ALREADY_ACTIVE → HTTP 409.
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS room_sessions_one_active_per_room
        ON room_sessions(room_id)
        WHERE status = 'active';
    `);
    logger.info("Startup migration: room_sessions_one_active_per_room unique index ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_sessions_one_active_per_room unique index failed (non-fatal)");
  }

  // ── room_prayer_requests session_id column (Task #438) ─────────────────────
  // Allows prayer requests to be scoped to a session so completeSession()
  // can count them by FK rather than relying on a time-window query, and so
  // addPrayerRequest() can gate inserts atomically on the session's active status.
  try {
    await pool.query(`
      ALTER TABLE room_prayer_requests
        ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES room_sessions(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS room_prayer_requests_session_idx
        ON room_prayer_requests(session_id)
        WHERE session_id IS NOT NULL;
    `);
    logger.info("Startup migration: room_prayer_requests.session_id column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_prayer_requests.session_id column failed (non-fatal)");
  }

  // ── Groups V2: clean up accidentally-linked 15-minutes-with-jesus ───────────
  // When groups were created via the "Study Together" shortcut on the Daily
  // Rhythm Walk, startShared linked '15-minutes-with-jesus' into room_journeys
  // even if the leader never intended that as the group study.  Remove those
  // incidental room_journeys rows for rooms whose primary study (linked_content_id)
  // is now something else.  Does NOT touch user_journey_progress — personal walk
  // progress is unaffected.
  try {
    await pool.query(`
      DELETE FROM room_journeys rj
      WHERE rj.journey_id = '15-minutes-with-jesus'
        AND rj.room_id IN (
          SELECT id FROM rooms
          WHERE linked_content_id IS NOT NULL
            AND linked_content_id <> '15-minutes-with-jesus'
        )
    `);
    logger.info("Startup migration: incidental room_journeys '15-minutes-with-jesus' rows cleaned up (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_journeys cleanup failed (non-fatal)");
  }

  // ── Groups V2: leader_note, next_meeting, reveal_on_meeting on rooms ─────
  // Three nullable columns that power the new Group Home redesign (V2).
  // leader_note      — short message the group leader can write for members to read
  //                    before they meet.
  // next_meeting     — datetime of the next scheduled meeting (TIMESTAMPTZ).
  // reveal_on_meeting — when TRUE the Today's Study card is hidden until the
  //                    leader starts a session.
  try {
    await pool.query(`
      ALTER TABLE rooms
        ADD COLUMN IF NOT EXISTS leader_note       TEXT,
        ADD COLUMN IF NOT EXISTS next_meeting      TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reveal_on_meeting BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    logger.info("Startup migration: rooms leader_note/next_meeting/reveal_on_meeting columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: rooms V2 columns failed (non-fatal)");
  }

  // ── Room session acknowledgements (2026-08) ───────────────────────────────
  // Per-user, per-session acknowledgement of the Session Complete modal.
  // Prevents the modal from re-appearing when a member opens the Group on a
  // different device or after clearing localStorage.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_session_acknowledgements (
        session_id  uuid        NOT NULL,
        user_id     text        NOT NULL,
        acknowledged_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, user_id)
      );
    `);
    logger.info("Startup migration: room_session_acknowledgements table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room_session_acknowledgements table failed (non-fatal)");
  }

  // ── Room media attachments + presentation (2026-08) ──────────────────────
  // attachment JSONB on messages; allow_member_present on rooms; active-
  // presentation table for the "Present to Group" feature.
  try {
    await pool.query(`
      ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS attachment JSONB;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS allow_member_present BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS room_media_presentations (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id           UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        session_id        UUID        REFERENCES room_sessions(id) ON DELETE SET NULL,
        message_id        UUID,
        filename          TEXT        NOT NULL,
        media_type        TEXT        NOT NULL,
        object_path       TEXT        NOT NULL DEFAULT '',
        presented_by      TEXT        NOT NULL,
        presented_by_name TEXT        NOT NULL DEFAULT '',
        current_page      INTEGER     NOT NULL DEFAULT 1,
        started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS room_media_presentations_room_id_idx
        ON room_media_presentations(room_id);
      ALTER TABLE room_media_presentations ADD COLUMN IF NOT EXISTS page_count INTEGER;
    `);
    logger.info("Startup migration: room media tables ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: room media tables failed (non-fatal)");
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

  // ── Step display labels (2026-08) ────────────────────────────────────────────
  // step_label_prefix on journeys:      "Day", "Step", or a custom string (null = auto-derive).
  // display_label on journey_steps:     per-step override, e.g. "1 January".
  // display_label on devotional_entries: same per-entry override for devotional series.
  {
    const labelAlters = [
      `ALTER TABLE journeys            ADD COLUMN IF NOT EXISTS step_label_prefix text`,
      `ALTER TABLE journey_steps       ADD COLUMN IF NOT EXISTS display_label text`,
      `ALTER TABLE devotional_entries  ADD COLUMN IF NOT EXISTS display_label text`,
    ];
    for (const stmt of labelAlters) {
      try {
        await pool.query(stmt);
      } catch (err) {
        logger.warn({ err, stmt }, "Startup migration: step display label column alter failed (non-fatal)");
      }
    }
    logger.info("Startup migration: step display label columns ensured (idempotent)");
  }

  // Back-fill display_label for Psalms Daily Devotional entries that were
  // created in production before the bulk-generate feature existed.
  // Formula: January 1 2026 + (day_number - 1) days → "D Month" format.
  // Idempotent: only updates rows where display_label IS NULL.
  {
    try {
      const r = await pool.query(`
        UPDATE devotional_entries
        SET display_label = TO_CHAR(
          DATE '2026-01-01' + (day_number - 1) * INTERVAL '1 day',
          'FMDD Month'
        )
        WHERE series_id = 'd5319697-1a29-43ec-9e08-1c95e4ea7b1d'
          AND display_label IS NULL
      `);
      if ((r.rowCount ?? 0) > 0) {
        logger.info(
          { updated: r.rowCount },
          "Startup migration: Psalms display_label back-fill applied",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Startup migration: Psalms display_label back-fill failed (non-fatal)");
    }
  }

  // voice_settings — single-row table for Emmaus Voice configuration.
  // Persists admin changes (enabled, voice, speed) across server restarts.
  {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS voice_settings (
        id       INTEGER PRIMARY KEY DEFAULT 1,
        enabled  BOOLEAN        NOT NULL DEFAULT false,
        voice    TEXT           NOT NULL DEFAULT 'nova',
        speed    NUMERIC(5, 2)  NOT NULL DEFAULT 1.0,
        CONSTRAINT voice_settings_single_row CHECK (id = 1)
      )
    `);
    // Widen speed precision on existing installations: NUMERIC(3,1) cannot store
    // 0.25 (rounds to 0.3), breaking round-trip for fine-grained speed values.
    // NUMERIC(5,2) supports the full 0.25–4.0 range exactly.
    try {
      await pool.query(`ALTER TABLE voice_settings ALTER COLUMN speed TYPE NUMERIC(5,2)`);
    } catch {
      // Silently ignore — already the correct type or column doesn't exist yet
    }
    // Add VAD tuning columns (idempotent — ADD COLUMN IF NOT EXISTS).
    // vad_threshold: average frequency-bin amplitude required to count as speech (1–100).
    // vad_ticks:     consecutive 100 ms intervals above threshold required to confirm speech (1–20).
    // Defaults match the hardcoded values that were shipped in the initial Voice release.
    await pool.query(`ALTER TABLE voice_settings ADD COLUMN IF NOT EXISTS vad_threshold INTEGER NOT NULL DEFAULT 50`);
    await pool.query(`ALTER TABLE voice_settings ADD COLUMN IF NOT EXISTS vad_ticks     INTEGER NOT NULL DEFAULT 6`);
    // Seed row defaults to enabled = true.
    // ON CONFLICT: preserve the enabled column if an admin has already touched it,
    // but upgrade the row from the original false default so existing deployments
    // where the row was never manually changed also get voice enabled.
    // (Idempotent: once an admin has explicitly set enabled=false via Settings,
    //  the next restart will not re-enable it because the row stays as-is.)
    await pool.query(`
      INSERT INTO voice_settings (id, enabled, voice, speed)
      VALUES (1, true, 'nova', 1.0)
      ON CONFLICT (id) DO NOTHING
    `);
    // One-time upgrade: rows seeded with the old false default get flipped to true.
    // This does NOT run if an admin has already used Settings to change enabled,
    // because they would have set it to false deliberately — but we have no flag
    // to distinguish "seeded false" from "admin set false".  The pragmatic call
    // is to enable by default and let an admin turn it off in Settings if needed.
    await pool.query(`
      UPDATE voice_settings SET enabled = true WHERE id = 1 AND enabled = false
    `);
    // Lower VAD defaults: threshold 50 → 30, ticks 6 → 3.
    // The old values (50/6) were too aggressive for many devices and caused the
    // voice input to be silently rejected even when the user was clearly speaking.
    // Only update rows that still carry the original defaults — admin-customised
    // values (those not equal to the old defaults) are left untouched.
    await pool.query(`
      UPDATE voice_settings
      SET    vad_threshold = 30,
             vad_ticks     = 3
      WHERE  id = 1
        AND  vad_threshold = 50
        AND  vad_ticks     = 6
    `);
    logger.info("Startup migration: voice_settings table ensured (idempotent)");
  }

  // ─── Share image URL columns ───────────────────────────────────────────────
  // Optional per-step/entry share image stored as an object-storage path.
  // Added to journey_steps, devotional_entries, and sermon_companion_entry.
  {
    await pool.query(`ALTER TABLE journey_steps          ADD COLUMN IF NOT EXISTS share_image_url TEXT`);
    await pool.query(`ALTER TABLE devotional_entries     ADD COLUMN IF NOT EXISTS share_image_url TEXT`);
    await pool.query(`ALTER TABLE sermon_companion_entry ADD COLUMN IF NOT EXISTS share_image_url TEXT`);
    logger.info("Startup migration: share_image_url columns ensured (idempotent)");
  }

  // ─── Reseed tombstones — tracks permanently deleted seed journeys ───────────
  // When an admin permanently deletes a journey that is part of the seed data,
  // prod-data-sync must not restore it on the next boot.  This table is the
  // authoritative "do not re-insert" list checked by prod-data-sync before
  // upserting any journey.
  {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reseed_tombstones (
        journey_id   TEXT        PRIMARY KEY,
        deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_by   TEXT
      )
    `);
    logger.info("Startup migration: reseed_tombstones table ensured (idempotent)");
  }

  // ─── Fix walk journey_type — journeys created from the Walks tab with a
  // legacy sub-type value ('core', 'series', 'course') should be 'walk' so
  // they appear in the Walks (Quick Studies) section on Today's Steps.
  // Sermon companions are intentionally excluded: they have their own
  // sermon_companion model and must never be treated as Walks.
  // Safe to re-run: only touches rows that are NOT already the correct type.
  {
    const { rowCount } = await pool.query(`
      UPDATE journeys
      SET    journey_type = 'walk'
      WHERE  journey_type IN ('core', 'series', 'course')
    `);
    if (rowCount && rowCount > 0) {
      logger.info(`Startup migration: ${rowCount} journey(s) with legacy type corrected to 'walk'`);
    } else {
      logger.info("Startup migration: walk journey_type correction — no rows needed fixing (idempotent)");
    }
  }

  // ─── Refresh duration_days for all journeys from actual published step count ─
  // duration_days is a cached count used by member-facing cards to render the
  // "Day X of Y" subtitle.  For admin-created walks (not in the seed) this count
  // can drift to 0 when steps are imported or created without going through the
  // normal publish path.  This migration brings every journey back in sync with
  // its real published, non-completion step count.  Runs on every boot; only
  // rows that are already correct are skipped (IS DISTINCT FROM guard).
  {
    const { rowCount } = await pool.query(`
      UPDATE journeys
      SET    duration_days = sub.max_day
      FROM (
        SELECT journey_id,
               COALESCE(MAX(day), 0) AS max_day
        FROM   journey_steps
        WHERE  is_completion_step = false
          AND  status = 'Published'
        GROUP BY journey_id
      ) sub
      WHERE  journeys.id = sub.journey_id
        AND  journeys.duration_days IS DISTINCT FROM sub.max_day
    `);
    if (rowCount && rowCount > 0) {
      logger.info(`Startup migration: refreshed duration_days on ${rowCount} journey(s) from live published step count`);
    } else {
      logger.info("Startup migration: duration_days sync — all journeys already correct (idempotent)");
    }
  }

  // ─── Repair spurious empty completion steps created by Walk authoring bug ───
  // A bug in StudioJourneyEditor caused clicking "Walk Complete" to create a
  // regular (is_completion_step=false) step at day N+1 with title "Walk Complete"
  // instead of the genuine completion step.  This migration removes any such
  // spurious step provided it contains no authored content (all content fields
  // null/blank) — preserving any step that an admin has written real content into.
  {
    const { rowCount } = await pool.query(`
      DELETE FROM journey_steps
      WHERE  is_completion_step IS NOT TRUE
        AND  title = 'Walk Complete'
        AND  COALESCE(TRIM(teaching_content),    '') = ''
        AND  COALESCE(TRIM(mentor_intro),        '') = ''
        AND  COALESCE(TRIM(scripture),           '') = ''
        AND  COALESCE(TRIM(reflection_question), '') = ''
        AND  COALESCE(TRIM(prayer),              '') = ''
        AND  COALESCE(TRIM(todays_action),       '') = ''
        AND  COALESCE(TRIM(memory_verse),        '') = ''
    `);
    if (rowCount && rowCount > 0) {
      logger.info(`Startup migration: removed ${rowCount} spurious empty "Walk Complete" step(s) (is_completion_step=false)`);
    } else {
      logger.info("Startup migration: spurious Walk Complete step cleanup — no rows found (idempotent)");
    }
  }

  // ─── Reseed devotional tombstones — tracks permanently deleted seed series ──
  // Mirrors reseed_tombstones (journeys) for devotional series.  When an admin
  // permanently deletes a devotional series that is part of the seed data,
  // prod-data-sync must not restore it on the next boot.
  {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reseed_devotional_tombstones (
        series_id  TEXT        PRIMARY KEY,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_by TEXT
      )
    `);
    logger.info("Startup migration: reseed_devotional_tombstones table ensured (idempotent)");
  }

  // ─── Remove __TEST__ devotional records from all environments ──────────────
  // Test records created during badge-lifecycle testing leaked into production
  // via the prod-data-sync upsert.  Delete them idempotently; safe to re-run.
  {
    await pool.query(`
      DELETE FROM devotional_entries
      WHERE series_id IN (
        SELECT id FROM devotional_series WHERE title LIKE '__TEST__%'
      )
    `);
    await pool.query(`
      DELETE FROM devotional_progress
      WHERE series_id IN (
        SELECT id FROM devotional_series WHERE title LIKE '__TEST__%'
      )
    `);
    const { rowCount } = await pool.query(`
      DELETE FROM devotional_series WHERE title LIKE '__TEST__%'
    `);
    if (rowCount && rowCount > 0) {
      logger.info(`Startup migration: removed ${rowCount} __TEST__ devotional series`);
    }
  }

  // ─── Restore who-is-god journey (deleted by prod-data-sync OLD_JOURNEY_IDS bug) ──
  // Background: "who-is-god" was in OLD_JOURNEY_IDS, which deleted matching rows on
  // every boot. The admin created a NEW walk with this ID in production on 2026-08-18,
  // and prod-data-sync wiped it. This migration restores the journey shell and the
  // six step stubs (titles recovered from content_audit_log; body content must be
  // re-authored by the admin).
  //
  // Guard: only runs in environments that have the "Come and See" collection
  // (id: 7b42bd4e-9325-4bf2-b789-2147b9ca2407). That collection only exists in
  // production — so this is a no-op in development.
  //
  // Permanent-delete guard: if the admin later permanently deletes this walk (which
  // records a row in reseed_tombstones), we must NOT recreate it on the next boot.
  // Tombstone check comes first so intentional deletions are always respected.
  {
    const COME_AND_SEE_ID = "7b42bd4e-9325-4bf2-b789-2147b9ca2407";
    const { rows: colRows } = await pool.query(
      "SELECT id FROM collections WHERE id = $1", [COME_AND_SEE_ID],
    );
    if (colRows.length > 0) {
      // Respect permanent deletes: if the admin tombstoned this walk, skip the restore.
      let isTombstoned = false;
      try {
        const { rows: tombRows } = await pool.query(
          "SELECT journey_id FROM reseed_tombstones WHERE journey_id = 'who-is-god'",
        );
        isTombstoned = tombRows.length > 0;
      } catch { /* table may not exist on very first boot — treat as not tombstoned */ }

      if (isTombstoned) {
        logger.info("Startup migration: who-is-god is tombstoned (admin permanently deleted it) — skipping restore");
      } else {
        const { rows: existing } = await pool.query(
          "SELECT id FROM journeys WHERE id = 'who-is-god'",
        );
        if (existing.length === 0) {
          // Restore the journey shell
          await pool.query(`
            INSERT INTO journeys
              (id, title, description, journey_type, duration_days, status,
               collection_id, created_by, updated_by)
            VALUES
              ('who-is-god', 'Who is God?', '', 'growth', 5, 'Draft',
               $1, 'system-restore', 'system-restore')
            ON CONFLICT (id) DO NOTHING
          `, [COME_AND_SEE_ID]);

          // Restore step stubs — titles from content_audit_log; content must be re-authored
          const steps = [
            { day: 1, title: "God Wants to Be Known",  isCompletion: false },
            { day: 2, title: "God the Creator",         isCompletion: false },
            { day: 3, title: "What Is God Like?",       isCompletion: false },
            { day: 4, title: "God Is Love",             isCompletion: false },
            { day: 5, title: "Knowing God",             isCompletion: false },
            { day: 6, title: "Walk Complete",           isCompletion: true  },
          ];
          for (const s of steps) {
            await pool.query(`
              INSERT INTO journey_steps
                (journey_id, day, title, status, is_completion_step)
              VALUES ($1, $2, $3, 'Draft', $4)
              ON CONFLICT DO NOTHING
            `, ["who-is-god", s.day, s.title, s.isCompletion]);
          }
          logger.warn(
            "Startup migration: restored who-is-god journey shell + 6 step stubs. " +
            "Step body content (teaching, scripture, prayer, reflection) was not in " +
            "the audit log and must be re-authored by the admin.",
          );
        } else {
          logger.info("Startup migration: who-is-god journey already present — no restore needed (idempotent)");
        }
      }
    }
  }

  // ── Generalised is_completion_step integrity scan (2026-08) ──────────────────
  // Replaces the one-off "created-in-god-s-image day 2" fix.
  //
  // Two rules enforced without touching duration_days (which is computed from
  // non-completion steps and would already be wrong when a regular lesson is
  // mis-flagged):
  //
  //  Position rule: a completion-flagged step must be the HIGHEST-day step in
  //    its journey.  If a higher-numbered non-deleted step exists in the same
  //    journey, the flagged step cannot be the legitimate completion card —
  //    clear it.  This is independent of the cached duration_days column.
  //
  //  Uniqueness rule: at most ONE step per journey may carry the flag.  If
  //    position cleanup still leaves multiple flagged steps (all tied at the
  //    max day is impossible, but defensive), keep only the highest-day one.
  //
  // Idempotent — safe to re-run on every boot; typically a no-op after the
  // first pass.
  try {
    // 1. Position invariant — clear any completion-flagged step that has a
    //    higher-numbered non-deleted sibling in the same journey.
    const posResult = await pool.query(`
      UPDATE journey_steps js
         SET is_completion_step = false,
             updated_at         = NOW()
       WHERE js.is_completion_step = true
         AND js.deleted_at         IS NULL
         AND EXISTS (
           SELECT 1
             FROM journey_steps higher
            WHERE higher.journey_id = js.journey_id
              AND higher.day        > js.day
              AND higher.deleted_at IS NULL
         )
    `);
    if ((posResult.rowCount ?? 0) > 0) {
      logger.info(
        `Startup migration: cleared is_completion_step on ${posResult.rowCount} step(s) that had a higher-numbered sibling (position invariant)`
      );
    }

    // 2. Uniqueness invariant — after position cleanup, keep only the
    //    highest-day completion step per journey if duplicates remain.
    const dupResult = await pool.query(`
      UPDATE journey_steps
         SET is_completion_step = false,
             updated_at         = NOW()
       WHERE (journey_id, day) IN (
         SELECT journey_id, day
           FROM (
             SELECT journey_id,
                    day,
                    ROW_NUMBER() OVER (
                      PARTITION BY journey_id
                      ORDER BY day DESC
                    ) AS rn
               FROM journey_steps
              WHERE is_completion_step = true
                AND deleted_at IS NULL
           ) ranked
          WHERE rn > 1
       )
    `);
    if ((dupResult.rowCount ?? 0) > 0) {
      logger.info(
        `Startup migration: cleared duplicate is_completion_step on ${dupResult.rowCount} step(s) (uniqueness invariant)`
      );
    }
  } catch (err) {
    logger.warn({ err }, "Startup migration: is_completion_step integrity scan failed (non-fatal)");
  }

  // ── Content Groups (Task #614) ───────────────────────────────────────────────
  // A separate grouping layer for journeys, daily-rhythms, and devotional series.
  // Does NOT touch or replace the existing Journey Collections (collections table).
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_groups (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title         text NOT NULL,
        description   text NOT NULL DEFAULT '',
        cover_image_url text,
        status        text NOT NULL DEFAULT 'Draft',
        display_order integer NOT NULL DEFAULT 0,
        created_at    timestamp NOT NULL DEFAULT NOW(),
        updated_at    timestamp NOT NULL DEFAULT NOW(),
        created_by    text,
        updated_by    text
      );

      CREATE TABLE IF NOT EXISTS content_group_items (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id      uuid NOT NULL REFERENCES content_groups(id) ON DELETE CASCADE,
        target_type   text NOT NULL,
        target_id     text NOT NULL,
        display_order integer NOT NULL DEFAULT 0,
        created_at    timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (group_id, target_type, target_id)
      );

      CREATE INDEX IF NOT EXISTS content_group_items_group_idx
        ON content_group_items(group_id, display_order);

      CREATE INDEX IF NOT EXISTS content_group_items_target_idx
        ON content_group_items(target_type, target_id);
    `);
    logger.info("Startup migration: content_groups + content_group_items tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: content_groups tables failed (non-fatal)");
  }

  // ── Partial unique index: at most one completion step per journey (2026-08) ──
  // This index is the DB-level safety net for the application-layer invariant:
  // only one step per journey may have is_completion_step = true AND deleted_at IS NULL.
  //
  // The cleanup scans above run first to remove any existing violations before
  // this index is created. On all subsequent boots this is a fast no-op.
  //
  // In the store layer (createStep / updateStep), the competing-flag clear and
  // the insert/update happen inside a single transaction. The partial unique
  // index prevents a concurrent transaction from committing a second completion
  // step even if two requests race past the application guard simultaneously.
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_journey_one_completion_step
        ON journey_steps (journey_id)
        WHERE is_completion_step = true
          AND deleted_at IS NULL
    `);
    logger.info("Startup migration: uidx_journey_one_completion_step partial unique index ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: uidx_journey_one_completion_step index failed (non-fatal)");
  }
}
