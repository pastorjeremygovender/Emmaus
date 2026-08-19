import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./lib/startup-migrations.js";
import { initVoiceSettings } from "./lib/voice-service.js";
import { runProdDataSync } from "./lib/prod-data-sync.js";
import { runSermonDataMigration } from "./lib/sermon-data-migration.js";
import { ensureSystemTemplates } from "./lib/workflows-store.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { protectCookieAuthenticatedMutation } from "./middlewares/originProtection.js";
import { isCanonicalRequestOrigin } from "./lib/public-origin.js";

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
    .then(() => initVoiceSettings())
    .then(() => runProdDataSync())
    .then(() => runSermonDataMigration())
    .then(() => ensureSystemTemplates())
    .then(() => logger.info("Startup: system task templates ensured"))
    .catch(err =>
      logger.warn({ err }, "Startup migrations / prod-data-sync encountered a non-fatal error")
    );
}

export default app;
