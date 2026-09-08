/**
 * Maintenance script: repair journey step publication status.
 *
 * This script publishes any Draft steps whose parent journey is already Published,
 * refreshes the duration_days counter for all Published journeys (counting only
 * Published steps), and retires the accidental "created-in-god-s-image" placeholder
 * journey if it was inadvertently left Published.
 *
 * WHEN TO RUN:
 *   Only when you believe a legacy database has Draft steps under Published journeys.
 *   Normal application writes (createStep, updateStep, publishJourney) maintain step
 *   status correctly, so this should be a no-op on any database written by the current
 *   application code. Run it manually after a deployment that changed step-status logic
 *   or after a manual DB operation.
 *
 * USAGE (development):
 *   pnpm --filter @workspace/api-server run repair:step-statuses
 *
 * USAGE (production — requires explicit opt-in):
 *   ALLOW_REPAIR_IN_PRODUCTION=true node --experimental-strip-types src/scripts/repair-step-statuses.ts
 */

const isProd = process.env.NODE_ENV === "production";
const allowProd = process.env.ALLOW_REPAIR_IN_PRODUCTION === "true";

if (isProd && !allowProd) {
  console.error(`
[repair-step-statuses] BLOCKED: NODE_ENV=production detected.
  This script mutates journey_steps and journeys.
  To run intentionally on production data, set:
    ALLOW_REPAIR_IN_PRODUCTION=true node --experimental-strip-types src/scripts/repair-step-statuses.ts
`);
  process.exit(1);
}

import { pool } from "@workspace/db";

console.log("[repair-step-statuses] Starting step status repair…");

const client = await pool.connect();
try {
  await client.query("BEGIN");

  // 1. Publish every Draft step whose parent journey is Published.
  const publishRes = await client.query(`
    UPDATE journey_steps
    SET status = 'Published', updated_at = NOW()
    WHERE status = 'Draft'
      AND journey_id IN (
        SELECT id FROM journeys WHERE status = 'Published'
      )
    RETURNING id, journey_id, day
  `);

  if (publishRes.rowCount && publishRes.rowCount > 0) {
    console.log(`[repair-step-statuses] Published ${publishRes.rowCount} Draft step(s) whose parent journey was Published.`);

    // 2. Refresh duration_days for each affected journey (count Published steps only).
    const affectedJourneyIds = [...new Set(publishRes.rows.map(r => r.journey_id as string))];
    for (const journeyId of affectedJourneyIds) {
      await client.query(`
        UPDATE journeys
        SET duration_days = (
          SELECT COUNT(*) FROM journey_steps
          WHERE journey_id = $1 AND status = 'Published'
        ),
        updated_at = NOW()
        WHERE id = $1
      `, [journeyId]);
    }
    console.log(`[repair-step-statuses] Refreshed duration_days for ${affectedJourneyIds.length} journey(s).`);
  } else {
    console.log("[repair-step-statuses] No Draft steps found under Published journeys — nothing to repair.");
  }

  // 3. Retire the accidental "created-in-god-s-image" placeholder journey.
  //    It has one "Untitled Step" and was shadowing "what-went-wrong" in the
  //    Coming to Jesus collection. Setting it to Draft removes it from the
  //    published catalogue without deleting any data.
  const retireRes = await client.query(`
    UPDATE journeys
    SET status = 'Draft', updated_at = NOW()
    WHERE id = 'created-in-god-s-image' AND status = 'Published'
    RETURNING id
  `);
  if (retireRes.rowCount && retireRes.rowCount > 0) {
    console.log("[repair-step-statuses] Retired placeholder journey 'created-in-god-s-image' (set to Draft).");
  }

  await client.query("COMMIT");
  console.log("[repair-step-statuses] Done.");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("[repair-step-statuses] FAILED (rolled back):", err);
  process.exit(1);
} finally {
  client.release();
  await pool.end().catch(() => {});
}
