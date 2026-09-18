import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";

const router = Router();

type SeededDefaults = {
  journeyIds: string[];
  devotionalSeriesIds: string[];
  companionIds: string[];
};

/**
 * Seed the first My Emmaus content only once, and only for an account with no
 * existing engagement history. The marker is account-backed so a member who
 * removes every card is never repopulated on a later visit or another device.
 */
router.post("/member-home/initialize-defaults", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const profile = await client.query(
      `SELECT home_defaults_initialized_at
         FROM user_profiles
        WHERE auth_subject = $1
        FOR UPDATE`,
      [userId],
    );

    if (!profile.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ initialized: false, seeded: false, reason: "profile_not_found" });
      return;
    }

    if (profile.rows[0].home_defaults_initialized_at) {
      await client.query("COMMIT");
      res.json({ initialized: true, seeded: false, defaults: emptyDefaults() });
      return;
    }

    const existingEngagement = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM user_journey_progress WHERE user_id = $1
         UNION ALL
         SELECT 1 FROM devotional_progress WHERE user_id = $1
         UNION ALL
         SELECT 1 FROM sermon_companion_progress WHERE user_id = $1
       ) AS has_engagement`,
      [userId],
    );

    const defaults = emptyDefaults();
    if (!existingEngagement.rows[0]?.has_engagement) {
      const dailyRhythm = await client.query(
        `SELECT id
           FROM journeys
          WHERE status = 'Published'
            AND journey_type IN ('daily-rhythm', 'core')
          ORDER BY CASE WHEN journey_type = 'daily-rhythm' THEN 0 ELSE 1 END,
                   display_order ASC, created_at ASC
          LIMIT 1`,
      );
      const emmausRoad = await client.query(
        `SELECT id
           FROM journeys
          WHERE status = 'Published'
            AND journey_type = 'walk'
            AND lower(trim(title)) = lower(trim('The Emmaus Road'))
          ORDER BY display_order ASC, created_at ASC
          LIMIT 1`,
      );
      const firstSteps = await client.query(
        `SELECT j.id
           FROM journeys j
           JOIN collections c ON c.id::text = j.collection_id::text
          WHERE j.status = 'Published'
            AND c.status = 'Published'
            AND lower(trim(c.title)) = lower(trim('First Steps - Come and See'))
          ORDER BY j.display_order ASC, j.created_at ASC
          LIMIT 1`,
      );
      const devotional = await client.query(
        `SELECT id
           FROM devotional_series
          WHERE status = 'Published'
            AND lower(trim(title)) = lower(trim('Psalms Daily Devotional'))
          ORDER BY display_order ASC, created_at ASC
          LIMIT 1`,
      );
      const companion = await client.query(
        `SELECT id
           FROM sermon_companion
          WHERE status = 'Published'
            AND is_current_week = true
          ORDER BY COALESCE(published_at, updated_at) DESC, updated_at DESC
          LIMIT 1`,
      );

      for (const row of [dailyRhythm.rows[0], emmausRoad.rows[0], firstSteps.rows[0]]) {
        if (row?.id) defaults.journeyIds.push(String(row.id));
      }
      if (devotional.rows[0]?.id) defaults.devotionalSeriesIds.push(String(devotional.rows[0].id));
      if (companion.rows[0]?.id) defaults.companionIds.push(String(companion.rows[0].id));

      if (defaults.journeyIds.length > 0) {
        await client.query(
          `INSERT INTO user_journey_progress
             (user_id, journey_id, current_day, completed_days, status,
              started_at, last_opened_at, daily_rhythm_unlock_at, display_origin,
              created_at, updated_at)
           SELECT $1, id, 1, '[]'::jsonb, 'active', NOW(), NOW(),
                  NOW(),
                  CASE WHEN journey_type = 'walk' THEN 'walk' ELSE 'journey' END,
                  NOW(), NOW()
             FROM journeys
            WHERE id = ANY($2::text[])
           ON CONFLICT (user_id, journey_id) DO NOTHING`,
          [userId, defaults.journeyIds],
        );
      }
      if (defaults.devotionalSeriesIds.length > 0) {
        await client.query(
          `INSERT INTO devotional_progress
             (user_id, series_id, current_day, completed_days, status,
              started_at, last_opened_at, updated_at)
           SELECT $1, id, 1, '[]'::jsonb, 'active', NOW(), NOW(), NOW()
             FROM devotional_series
            WHERE id = ANY($2::uuid[])
           ON CONFLICT (user_id, series_id) DO NOTHING`,
          [userId, defaults.devotionalSeriesIds],
        );
      }
      if (defaults.companionIds.length > 0) {
        await client.query(
          `INSERT INTO sermon_companion_progress
             (user_id, companion_id, current_day, completed_days, status,
              started_at, last_opened_at, updated_at)
           SELECT $1, id, 1, '[]'::jsonb, 'active', NOW(), NOW(), NOW()
             FROM sermon_companion
            WHERE id = ANY($2::uuid[])
           ON CONFLICT (user_id, companion_id) DO NOTHING`,
          [userId, defaults.companionIds],
        );
      }
    }

    await client.query(
      `UPDATE user_profiles
          SET home_defaults_initialized_at = NOW(), updated_at = NOW()
        WHERE auth_subject = $1`,
      [userId],
    );
    await client.query("COMMIT");
    res.json({
      initialized: true,
      seeded: !existingEngagement.rows[0]?.has_engagement,
      defaults,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /member-home/initialize-defaults failed", err);
    res.status(500).json({ error: "Could not initialize My Emmaus" });
  } finally {
    client.release();
  }
});

function emptyDefaults(): SeededDefaults {
  return { journeyIds: [], devotionalSeriesIds: [], companionIds: [] };
}

export default router;