import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { protectCookieAuthenticatedMutation } from "./middlewares/originProtection.js";
import { isCanonicalRequestOrigin } from "./lib/public-origin.js";
import { isApplicationReady } from "./lib/startup-readiness.js";

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
app.use("/api", (req, res, next) => {
  if (req.path === "/" || req.path === "/healthz" || isApplicationReady()) {
    next();
    return;
  }
  res.status(503).json({
    error: "Emmaus is starting. Please try again shortly.",
    code: "APPLICATION_STARTING",
  });
});
app.use(authMiddleware);
app.use(protectCookieAuthenticatedMutation);

app.use("/api", router);

export function startBackgroundInitialization(): void {
  // Production startup is deliberately read-only beyond the explicitly
  // reviewed schema guards in index.ts. Historical data migrations, fixture
  // cleanup and content seeding must be run only as separately reviewed jobs.
  logger.info("Startup: automatic legacy data migrations disabled");
}

export default app;
