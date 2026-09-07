process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED:", reason);
});

import app, { startBackgroundInitialization } from "./app";
import { logger } from "./lib/logger";
import { runSignalsEngine, logEngineRun } from "./lib/pastoral-store.js";
import { ensureAuthSchema } from "./lib/ensure-auth-schema.js";
import { getCanonicalPublicOrigin } from "./lib/public-origin.js";
import { runDailyRhythmProductionCorrection } from "./lib/daily-rhythm-production-correction.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  const publicOrigin = getCanonicalPublicOrigin();
  const authSchemaStartedAt = Date.now();
  logger.info("Startup phase beginning: ensure authentication schema");
  await ensureAuthSchema();
  logger.info(
    { durationMs: Date.now() - authSchemaStartedAt },
    "Startup phase complete: ensure authentication schema",
  );

  const dailyRhythmCorrectionStartedAt = Date.now();
  logger.info("Startup phase beginning: Daily Rhythm production correction");
  await runDailyRhythmProductionCorrection();
  logger.info(
    { durationMs: Date.now() - dailyRhythmCorrectionStartedAt },
    "Startup phase complete: Daily Rhythm production correction",
  );

  const server = app.listen(port, () => {
    logger.info({ port, publicOrigin }, "Server listening");
    scheduleNightlySignalsEngine();
    startBackgroundInitialization();
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

void startServer().catch((err) => {
  logger.fatal({ err }, "Secure authentication startup failed");
  process.exit(1);
});

// ─── Nightly signals engine ───────────────────────────────────────────────────

/**
 * Schedules the signals engine to run every day at 02:00 local server time.
 * Calculates the delay to the next 2am, then repeats every 24 hours.
 */
function scheduleNightlySignalsEngine(): void {
  const now = new Date();
  const next2am = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    2, 0, 0, 0,
  );
  // If 2am has already passed today, schedule for tomorrow
  if (next2am.getTime() <= now.getTime()) {
    next2am.setDate(next2am.getDate() + 1);
  }
  const msUntilFirst = next2am.getTime() - now.getTime();

  logger.info(
    { nextRunAt: next2am.toISOString(), msUntilFirst },
    "Signals engine: nightly run scheduled",
  );

  setTimeout(() => {
    void runNightlySignalsEngine();
    // Repeat every 24 hours thereafter
    setInterval(() => { void runNightlySignalsEngine(); }, 24 * 60 * 60 * 1000);
  }, msUntilFirst);
}

async function runNightlySignalsEngine(): Promise<void> {
  logger.info("Signals engine: nightly run starting");
  try {
    const result = await runSignalsEngine();
    await logEngineRun(result, "scheduler");
    logger.info(result, "Signals engine: nightly run complete");
  } catch (err) {
    logger.error({ err }, "Signals engine: nightly run failed");
  }
}
