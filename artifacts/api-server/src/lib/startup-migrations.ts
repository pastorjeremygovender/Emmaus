/**
 * Startup migrations — idempotent data-model upgrades that run once on boot.
 *
 * Each migration targets a specific, named record and is guarded by a WHERE clause
 * so it is safe to re-run any number of times.
 */

import { db, pool } from "@workspace/db";
import { journeysTable } from "@workspace/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { logger } from "./logger.js";
export async function runStartupMigrations(): Promise<void> {
  // ── Daily Devotionals tables (2026-07) ───────────────────────────────────────
  // Create the three devotional tables idempotently. Drizzle schema is the source
  // of truth for column definitions; this migration only ensures the tables exist.
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
        started_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, series_id)
      );
    `);
    logger.info("Startup migration: devotional tables created (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: devotional tables failed (non-fatal)");
  }


  // ── Daily Rhythm Architecture (2026-07) ──────────────────────────────────────
  // Promote "15-minutes-with-jesus" from journeyType "core" → "daily-rhythm".
  // The 'daily-rhythm' type is a permanent, never-ending daily practice;
  // 'core' remains valid for finite onboarding journeys.
  try {
    await db
      .update(journeysTable)
      .set({ journeyType: "daily-rhythm" })
      .where(
        and(
          eq(journeysTable.id, "15-minutes-with-jesus"),
          eq(journeysTable.journeyType, "core")
        )
      );
    logger.info("Startup migration: daily-rhythm type applied (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: daily-rhythm type failed (non-fatal)");
  }

  // ── Restore Daily Rhythm to Published (2026-07) ──────────────────────────────
  // The Daily Rhythm journey is a permanent, always-on practice.
  // If it was accidentally set to Archived via the editor, restore it to Published
  // so the Walk screen can always find it via listPublishedJourneys().
  try {
    await db
      .update(journeysTable)
      .set({ status: "Published" })
      .where(
        and(
          eq(journeysTable.id, "15-minutes-with-jesus"),
          eq(journeysTable.status, "Archived")
        )
      );
    logger.info("Startup migration: daily-rhythm status restored to Published (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: daily-rhythm status restore failed (non-fatal)");
  }

  // ── Rename sprint (2026-07) ──────────────────────────────────────────────────
  // Display title update: journey was formerly "15 Minutes with Jesus", now "10 Minutes with Jesus".
  // The journey ID ("15-minutes-with-jesus") and all member progress are preserved.
  // estimatedDuration updated to reflect the new invitational framing.
  try {
    await db
      .update(journeysTable)
      .set({
        title: "10 Minutes with Jesus",
        estimatedDuration: "10 min/day",
      })
      .where(
        and(
          eq(journeysTable.id, "15-minutes-with-jesus"),
          ne(journeysTable.title, "10 Minutes with Jesus")
        )
      );
    logger.info("Startup migration: title renamed to '10 Minutes with Jesus' (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Startup migration: title rename failed (non-fatal)");
  }

}
