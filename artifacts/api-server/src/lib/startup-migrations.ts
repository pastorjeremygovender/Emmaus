/**
 * Startup migrations — idempotent data-model upgrades that run once on boot.
 *
 * Each migration targets a specific, named record and is guarded by a WHERE clause
 * so it is safe to re-run any number of times.
 */

import { db } from "@workspace/db";
import { journeysTable } from "@workspace/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runStartupMigrations(): Promise<void> {
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
