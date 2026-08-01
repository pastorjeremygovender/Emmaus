import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./lib/startup-migrations.js";
import { runProdDataSync } from "./lib/prod-data-sync.js";

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
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Run startup migrations on boot (non-blocking — never prevents startup)
runStartupMigrations()
  .then(() => runProdDataSync())
  .catch(err =>
    logger.warn({ err }, "Startup migrations / prod-data-sync encountered a non-fatal error")
  );

export default app;
