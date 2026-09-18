/**
 * analytics.ts — REST routes for the Emmaus Analytics Centre (Checkpoint 6).
 * Mounted at /api/analytics in routes/index.ts.
 * All routes are admin/superAdmin-gated.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getChurchHealthKpis,
  getAttendanceTrends,
  getDiscipleshipAnalytics,
  getRetentionFunnel,
  getSpiritualGrowth,
  getRoomAnalytics,
  getSermonAnalytics,
  getBibleAnalytics,
  getPastoralCareAnalytics,
  getPredictiveInsights,
  listSavedReports,
  createSavedReport,
  deleteSavedReport,
} from "../lib/analytics-store.js";
import { getUserRole } from "../lib/user-role-store.js";
import { requireAuth } from "../emmaus/auth.js";

export const analyticsRouter = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = requireAuth(req, res);
  if (!userId) return; // requireAuth already sent 401
  const role = await getUserRole(userId);
  if (role === "admin" || role === "superAdmin") return next();
  res.status(403).json({ error: "Admin access required." });
}

analyticsRouter.use(requireAdmin);

// ─── S1 — Church Health KPIs ─────────────────────────────────────────────────
analyticsRouter.get("/health-kpis", async (_req, res) => {
  try {
    res.json(await getChurchHealthKpis());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S2 — Attendance Trends ───────────────────────────────────────────────────
analyticsRouter.get("/attendance-trends", async (_req, res) => {
  try {
    res.json(await getAttendanceTrends());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S3 — Discipleship Analytics ─────────────────────────────────────────────
analyticsRouter.get("/discipleship", async (_req, res) => {
  try {
    res.json(await getDiscipleshipAnalytics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S4 — Retention Funnel ────────────────────────────────────────────────────
analyticsRouter.get("/retention-funnel", async (_req, res) => {
  try {
    res.json(await getRetentionFunnel());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S5 — Spiritual Growth ────────────────────────────────────────────────────
analyticsRouter.get("/spiritual-growth", async (_req, res) => {
  try {
    res.json(await getSpiritualGrowth());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S6 — Room Analytics ──────────────────────────────────────────────────────
analyticsRouter.get("/rooms", async (_req, res) => {
  try {
    res.json(await getRoomAnalytics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S7 — Sermon Analytics ────────────────────────────────────────────────────
analyticsRouter.get("/sermons", async (_req, res) => {
  try {
    res.json(await getSermonAnalytics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S8 — Bible Analytics ─────────────────────────────────────────────────────
analyticsRouter.get("/bible", async (_req, res) => {
  try {
    res.json(await getBibleAnalytics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S9 — Pastoral Care Analytics ────────────────────────────────────────────
analyticsRouter.get("/pastoral-care", async (_req, res) => {
  try {
    res.json(await getPastoralCareAnalytics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S12 — Predictive Insights ───────────────────────────────────────────────
analyticsRouter.get("/insights", async (_req, res) => {
  try {
    res.json(await getPredictiveInsights());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S13 — Saved Reports ──────────────────────────────────────────────────────
analyticsRouter.get("/saved-reports", async (_req, res) => {
  try {
    res.json(await listSavedReports());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

analyticsRouter.post("/saved-reports", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description = "", config = {} } = req.body ?? {};
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    res.json(await createSavedReport("icc", name, description, config, userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

analyticsRouter.delete("/saved-reports/:id", async (req, res) => {
  try {
    await deleteSavedReport(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
