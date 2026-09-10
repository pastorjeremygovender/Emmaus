process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED:", reason);
});

let startupLogger: typeof import("./lib/logger.js").logger | undefined;
let bootstrapReady = false;
let applicationHandler:
  | ((req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void)
  | undefined;

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
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0];
    if (
      path === "/" ||
      path === "/healthz" ||
      path === "/api" ||
      path === "/api/healthz"
    ) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "ok", ready: bootstrapReady }));
      return;
    }
    if (applicationHandler) {
      applicationHandler(req, res);
      return;
    }
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "Emmaus is starting. Please try again shortly.",
        code: "APPLICATION_STARTING",
      }),
    );
  });

  server.on("error", (err) => {
    console.error("LISTENER ERROR:", err);
    process.exit(1);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });

  const [
    { default: app, startBackgroundInitialization },
    { logger },
    { runSignalsEngine, logEngineRun },
    { ensureAuthSchema },
    { getCanonicalPublicOrigin },
    { runDailyRhythmProductionCorrection },
    { markApplicationReady },
    { ensureJarvisConversationSchema },
  ] = await Promise.all([
    import("./app.js"),
    import("./lib/logger.js"),
    import("./lib/pastoral-store.js"),
    import("./lib/ensure-auth-schema.js"),
    import("./lib/public-origin.js"),
    import("./lib/daily-rhythm-production-correction.js"),
    import("./lib/startup-readiness.js"),
    import("./lib/jarvis-conversation-schema.js"),
  ]);

  startupLogger = logger;
  const publicOrigin = getCanonicalPublicOrigin();
  applicationHandler = app;
  logger.info({ port, publicOrigin }, "Server listening; startup checks beginning");

  const authSchemaStartedAt = Date.now();
  logger.info("Startup phase beginning: ensure authentication schema");
  await ensureAuthSchema();
  logger.info(
    { durationMs: Date.now() - authSchemaStartedAt },
    "Startup phase complete: ensure authentication schema",
  );

  const jarvisSchemaStartedAt = Date.now();
  logger.info("Startup phase beginning: ensure Jarvis conversation schema");
  await ensureJarvisConversationSchema();
  logger.info(
    { durationMs: Date.now() - jarvisSchemaStartedAt },
    "Startup phase complete: ensure Jarvis conversation schema",
  );

  const dailyRhythmCorrectionStartedAt = Date.now();
  logger.info("Startup phase beginning: Daily Rhythm production correction");
  await runDailyRhythmProductionCorrection();
  logger.info(
    { durationMs: Date.now() - dailyRhythmCorrectionStartedAt },
    "Startup phase complete: Daily Rhythm production correction",
  );

  markApplicationReady();
  bootstrapReady = true;
  logger.info("Startup checks complete; application ready");
  scheduleNightlySignalsEngine(runSignalsEngine, logEngineRun);
  startBackgroundInitialization();
}

void startServer().catch((err) => {
  if (startupLogger) {
    startupLogger.fatal({ err }, "Secure authentication startup failed");
  } else {
    console.error("STARTUP FAILURE:", err);
  }
  process.exit(1);
});

// ─── Nightly signals engine ───────────────────────────────────────────────────

/**
 * Schedules the signals engine to run every day at 02:00 local server time.
 * Calculates the delay to the next 2am, then repeats every 24 hours.
 */
function scheduleNightlySignalsEngine(
  runSignalsEngine: typeof import("./lib/pastoral-store.js").runSignalsEngine,
  logEngineRun: typeof import("./lib/pastoral-store.js").logEngineRun,
): void {
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

  startupLogger?.info(
    { nextRunAt: next2am.toISOString(), msUntilFirst },
    "Signals engine: nightly run scheduled",
  );

  setTimeout(() => {
    void runNightlySignalsEngine(runSignalsEngine, logEngineRun);
    // Repeat every 24 hours thereafter
    setInterval(() => {
      void runNightlySignalsEngine(runSignalsEngine, logEngineRun);
    }, 24 * 60 * 60 * 1000);
  }, msUntilFirst);
}

async function runNightlySignalsEngine(
  runSignalsEngine: typeof import("./lib/pastoral-store.js").runSignalsEngine,
  logEngineRun: typeof import("./lib/pastoral-store.js").logEngineRun,
): Promise<void> {
  const { logger } = await import("./lib/logger.js");
  logger.info("Signals engine: nightly run starting");
  try {
    const result = await runSignalsEngine();
    await logEngineRun(result, "scheduler");
    logger.info(result, "Signals engine: nightly run complete");
  } catch (err) {
    logger.error({ err }, "Signals engine: nightly run failed");
  }
}
