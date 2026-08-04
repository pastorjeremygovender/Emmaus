/**
 * Pastoral Workflows & Ministry Actions routes (CP7).
 *
 * Mounted at: /api/workflows
 *
 * All routes require admin or superAdmin role.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import * as store from "../lib/workflows-store.js";
import { getUserRole } from "../lib/user-role-store.js";
import { requireAuth } from "../emmaus/auth.js";
import { logger } from "../lib/logger.js";

export const workflowsRouter = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const role = await getUserRole(userId);
  if (role === "admin" || role === "superAdmin") return next();

  // Also allow pastoral roles
  res.status(403).json({ error: "Admin or pastoral access required." });
}

function currentUser(req: Request): string {
  return (req.session as Record<string, unknown>)?.userId as string ?? "unknown";
}

workflowsRouter.use(requireAdmin);

// ─── Tasks ────────────────────────────────────────────────────────────────────

/** GET /workflows/tasks — list (supports ?status=&assignedTo=&personId=&team=) */
workflowsRouter.get("/tasks", async (req: Request, res: Response) => {
  try {
    const { status, assignedTo, personId, personType, team, includeArchived, overdueOnly } =
      req.query as Record<string, string>;
    const tasks = await store.listTasks({
      status: status as store.TaskStatus | "active" | undefined,
      assignedTo,
      personId,
      personType,
      team,
      includeArchived: includeArchived === "true",
      overdueOnly: overdueOnly === "true",
    });
    res.json(tasks);
  } catch (err) {
    logger.error({ err }, "GET /workflows/tasks failed");
    res.status(500).json({ error: String(err) });
  }
});

/** POST /workflows/tasks — create */
workflowsRouter.post("/tasks", async (req: Request, res: Response) => {
  try {
    const task = await store.createTask({ ...req.body, createdBy: currentUser(req) });
    res.status(201).json(task);
  } catch (err) {
    logger.error({ err }, "POST /workflows/tasks failed");
    res.status(500).json({ error: String(err) });
  }
});

/** GET /workflows/tasks/leader — leader's own task view */
workflowsRouter.get("/tasks/leader", async (req: Request, res: Response) => {
  try {
    const me = currentUser(req);
    const view = await store.getLeaderView(me);
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** GET /workflows/tasks/pastor — full pastor view */
workflowsRouter.get("/tasks/pastor", async (req: Request, res: Response) => {
  try {
    const view = await store.getPastorView();
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** GET /workflows/tasks/:id — get one */
workflowsRouter.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await store.getTask(String(req.params.id));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** PATCH /workflows/tasks/:id — update */
workflowsRouter.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await store.updateTask(String(req.params.id), req.body);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (err) {
    logger.error({ err }, "PATCH /workflows/tasks/:id failed");
    res.status(500).json({ error: String(err) });
  }
});

/** DELETE /workflows/tasks/:id — archive */
workflowsRouter.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const ok = await store.archiveTask(String(req.params.id));
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Signal suggestions ────────────────────────────────────────────────────────

/** GET /workflows/suggestions — care signal → suggested tasks */
workflowsRouter.get("/suggestions", async (_req: Request, res: Response) => {
  try {
    const suggestions = await store.getSignalSuggestions();
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /workflows/suggestions/:signalId/create-task — create a task from signal */
workflowsRouter.post(
  "/suggestions/:signalId/create-task",
  async (req: Request, res: Response) => {
    try {
      const task = await store.createTask({
        ...req.body,
        signalId: String(req.params.signalId),
        source: "care_signal",
        createdBy: currentUser(req),
      });
      res.status(201).json(task);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

// ─── Templates ────────────────────────────────────────────────────────────────

/** GET /workflows/templates */
workflowsRouter.get("/templates", async (_req: Request, res: Response) => {
  try {
    res.json(await store.listTemplates());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /workflows/templates */
workflowsRouter.post("/templates", async (req: Request, res: Response) => {
  try {
    const tmpl = await store.createTemplate({ ...req.body, createdBy: currentUser(req) });
    res.status(201).json(tmpl);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** PATCH /workflows/templates/:id */
workflowsRouter.patch("/templates/:id", async (req: Request, res: Response) => {
  try {
    const tmpl = await store.updateTemplate(String(req.params.id), req.body);
    if (!tmpl) { res.status(404).json({ error: "Template not found or is a system template" }); return; }
    res.json(tmpl);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** DELETE /workflows/templates/:id */
workflowsRouter.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    const ok = await store.deleteTemplate(String(req.params.id));
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Notes ────────────────────────────────────────────────────────────────────

/** GET /workflows/notes?personId=&taskId=&includeConfidential= */
workflowsRouter.get("/notes", async (req: Request, res: Response) => {
  try {
    const { personId, personType, taskId, includeConfidential } =
      req.query as Record<string, string>;
    const notes = await store.listNotes({
      personId, personType, taskId,
      includeConfidential: includeConfidential === "true",
    });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /workflows/notes — create (immutable) */
workflowsRouter.post("/notes", async (req: Request, res: Response) => {
  try {
    const note = await store.createNote({ ...req.body, authorId: currentUser(req) });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────

/** GET /workflows/search?q= */
workflowsRouter.get("/search", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) { res.json([]); return; }
    res.json(await store.searchWorkflows(q));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Reports ──────────────────────────────────────────────────────────────────

/** GET /workflows/reports */
workflowsRouter.get("/reports", async (_req: Request, res: Response) => {
  try {
    res.json(await store.getWorkflowReports());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

/** GET /workflows/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD */
workflowsRouter.get("/calendar", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const endDefault = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    res.json(await store.getCalendarEvents(from ?? today, to ?? endDefault));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
