import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isApplicationReady } from "../lib/startup-readiness.js";

const router: IRouter = Router();

function sendHealthResponse(_req: Request, res: Response): void {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

// Replit's artifact router probes the API artifact's preview path (/api).
// Keep the explicit health endpoint as well, but make the preview path a
// successful liveness response so publishing can promote the API process.
router.get("/", sendHealthResponse);
router.get("/healthz", (_req, res) => {
  // This endpoint is the deployment liveness probe. It must stay successful
  // while the process completes its database startup work; application routes
  // remain gated separately in app.ts until readiness is true.
  res.json({
    status: "ok",
    ready: isApplicationReady(),
  });
});

export default router;
