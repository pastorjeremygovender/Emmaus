/**
 * Startup migrations — idempotent data-model upgrades that run once on boot.
 *
 * Each migration targets a specific, named record and is guarded by a WHERE clause
 * so it is safe to re-run any number of times.
 */

import { db } from "@workspace/db";
import { journeysTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
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
}
