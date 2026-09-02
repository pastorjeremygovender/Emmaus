import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./lib/startup-migrations.js";
import { initVoiceSettings } from "./lib/voice-service.js";
import { runSermonDataMigration } from "./lib/sermon-data-migration.js";
import { ensureSystemTemplates } from "./lib/workflows-store.js";
import { removeKnownAccountFixtures } from "./lib/known-account-fixtures.js";
import { recoverInterruptedSharedEmmausRequests } from "./lib/room-store.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { protectCookieAuthenticatedMutation } from "./middlewares/originProtection.js";
import { isCanonicalRequestOrigin } from "./lib/public-origin.js";
import { runDailyRhythmProductionCorrection } from "./lib/daily-rhythm-production-correction.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isCanonicalRequestOrigin(origin));
    },
  }),
);
app.use(cookieParser());
// 20 MB cap accounts for base64 expansion (~33% overhead) of audio recordings.
// The voice/transcribe route enforces a tighter per-request guard inside the handler.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);
app.use(protectCookieAuthenticatedMutation);

app.use("/api", router);

export function startBackgroundInitialization(): void {
  runStartupMigrations()
    .then(async () => {
      const recovered = await recoverInterruptedSharedEmmausRequests();
      if (recovered > 0) {
        logger.info(
          { recovered },
          "Startup: marked interrupted shared Ask Emmaus requests as failed",
        );
      }
    })
    .then(() => removeKnownAccountFixtures())
    .then(() => initVoiceSettings())
    .then(() => runSermonDataMigration())
    .then(() => ensureSystemTemplates())
    .then(() => logger.info("Startup: system task templates ensured"))
    .catch(err =>
      logger.warn({ err }, "Startup initialization encountered a non-fatal error")
    );
}

export default app;
