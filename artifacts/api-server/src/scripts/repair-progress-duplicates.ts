/**
 * Maintenance script: remove duplicate user_journey_progress rows.
 *
 * The application enforces a UNIQUE INDEX on (user_id, journey_id) in
 * user_journey_progress. This script is needed only on databases that were
 * created before that index existed and may contain duplicate rows.
 *
 * It:
 *   1. Merges all completed_days arrays from duplicate rows into the keeper row
 *      (highest current_day, then latest updated_at) so progress history is preserved.
 *   2. Deletes all non-keeper rows.
 *
 * After running this script, the CREATE UNIQUE INDEX in startup-migrations.ts will
 * succeed. Without running it first, the index creation will fail on any database
 * that still contains duplicates — in that case startup will log an error and the
 * /rooms/start-shared endpoint will return 503 until the situation is resolved.
 *
 * WHEN TO RUN:
 *   Once, on any database that predates the unique-index migration.
 *   If the index already exists (idxname uidx_user_journey_progress_user_journey is
 *   visible in pg_indexes), this script is a no-op and safe to run again.
 *
 * USAGE (development):
 *   pnpm --filter @workspace/api-server run repair:progress-duplicates
 *
 * USAGE (production — requires explicit opt-in):
 *   ALLOW_REPAIR_IN_PRODUCTION=true node --experimental-strip-types src/scripts/repair-progress-duplicates.ts
 */

const isProd = process.env.NODE_ENV === "production";
const allowProd = process.env.ALLOW_REPAIR_IN_PRODUCTION === "true";

if (isProd && !allowProd) {
  console.error(`
[repair-progress-duplicates] BLOCKED: NODE_ENV=production detected.
  This script mutates user_journey_progress.
  To run intentionally on production data, set:
    ALLOW_REPAIR_IN_PRODUCTION=true node --experimental-strip-types src/scripts/repair-progress-duplicates.ts
`);
  process.exit(1);
}

import { pool } from "@workspace/db";

console.log("[repair-progress-duplicates] Checking for duplicate user_journey_progress rows…");

const client = await pool.connect();
try {
  // Check if duplicates exist at all before doing any writes.
  const checkRes = await client.query(`
    SELECT COUNT(*) AS dupe_pairs
    FROM (
      SELECT user_id, journey_id
      FROM user_journey_progress
      GROUP BY user_id, journey_id
      HAVING COUNT(*) > 1
    ) t
  `);
  const dupePairs = Number(checkRes.rows[0].dupe_pairs);

  if (dupePairs === 0) {
    console.log("[repair-progress-duplicates] No duplicates found — nothing to repair.");
  } else {
    console.log(`[repair-progress-duplicates] Found ${dupePairs} duplicate (user_id, journey_id) pair(s). Repairing…`);

    await client.query("BEGIN");
    try {
      // Step 1: Merge all completed_days arrays into the keeper row
      // (highest current_day, then latest updated_at).
      const mergeRes = await client.query(`
        UPDATE user_journey_progress AS keeper
        SET completed_days = (
          SELECT COALESCE(
            jsonb_agg(DISTINCT val ORDER BY val),
            '[]'::jsonb
          )
          FROM (
            SELECT jsonb_array_elements(dup.completed_days) AS val
            FROM user_journey_progress dup
            WHERE dup.user_id    = keeper.user_id
              AND dup.journey_id = keeper.journey_id
          ) all_vals
        )
        WHERE keeper.id IN (
          SELECT DISTINCT ON (user_id, journey_id) id
          FROM user_journey_progress
          ORDER BY user_id, journey_id, current_day DESC, updated_at DESC
        )
        AND (
          SELECT count(*)
          FROM user_journey_progress x
          WHERE x.user_id = keeper.user_id AND x.journey_id = keeper.journey_id
        ) > 1
        RETURNING id
      `);
      console.log(`[repair-progress-duplicates] Merged completed_days into ${mergeRes.rowCount} keeper row(s).`);

      // Step 2: Delete every non-keeper row.
      const deleteRes = await client.query(`
        DELETE FROM user_journey_progress
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY user_id, journey_id
                ORDER BY current_day DESC, updated_at DESC
              ) AS rn
            FROM user_journey_progress
          ) t WHERE rn > 1
        )
        RETURNING id
      `);
      console.log(`[repair-progress-duplicates] Deleted ${deleteRes.rowCount} duplicate row(s).`);

      await client.query("COMMIT");
      console.log("[repair-progress-duplicates] Done. You can now restart the API server — the unique index will be created successfully.");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
} catch (err) {
  console.error("[repair-progress-duplicates] FAILED:", err);
  process.exit(1);
} finally {
  client.release();
  await pool.end().catch(() => {});
}
