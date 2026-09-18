import { Router, type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import {
  deactivateReminderSubscription,
  claimReminderWorkerInvocation,
  getOwnedReminderSubscription,
  getReminderSubscription,
  getUserReminderPreferences,
  isValidIanaTimezone,
  isValidReminderTime,
  updateReminderPreferences,
  upsertReminderSubscription,
} from "../lib/reminder-store.js";
import { deliverDueReminders, reminderConfig, sendReminderTest } from "../lib/reminder-service.js";
import { verifyReminderWorkerRequest } from "../lib/reminder-worker-auth.js";

export const remindersRouter = Router();

remindersRouter.post("/internal/reminders/deliver", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const verification = verifyReminderWorkerRequest({
    timestamp: req.get("x-emmaus-timestamp"),
    nonce: req.get("x-emmaus-nonce"),
    signature: req.get("x-emmaus-signature"),
  });
  if (!verification.ok) {
    if (verification.reason === "not-configured") {
      res.status(503).json({ error: "Reminder worker authentication is not configured." });
      return;
    }
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  if (!await claimReminderWorkerInvocation(verification.nonce, verification.requestedAt)) {
    res.status(409).json({ error: "Request already accepted." });
    return;
  }

  try {
    const result = await deliverDueReminders();
    req.log.info(result, "Authenticated reminder worker completed");
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err }, "Authenticated reminder worker failed");
    res.status(500).json({ error: "Reminder worker failed." });
  }
});

const EXACT_PUSH_SERVICE_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

const PUSH_SERVICE_HOST_SUFFIXES = [
  ".notify.windows.com",
  ".notify.live.net",
];

function isAllowedPushServiceHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return EXACT_PUSH_SERVICE_HOSTS.has(host) ||
    PUSH_SERVICE_HOST_SUFFIXES.some(suffix => host.endsWith(suffix) && host.length > suffix.length);
}

function endpointFrom(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === "443") &&
      isAllowedPushServiceHost(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function validSubscription(value: unknown): value is { endpoint: string; keys: Record<string, string> } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { endpoint?: unknown; keys?: unknown };
  if (!endpointFrom(candidate.endpoint) || !candidate.keys || typeof candidate.keys !== "object") return false;
  const keys = candidate.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return false;
  // PushSubscription keys are unpadded base64url encodings of a 65-byte
  // uncompressed P-256 public key and a 16-byte auth secret respectively.
  if (!/^[A-Za-z0-9_-]+$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]+$/.test(keys.auth)) return false;
  try {
    const publicKey = Buffer.from(keys.p256dh, "base64url");
    const auth = Buffer.from(keys.auth, "base64url");
    return publicKey.length === 65 && publicKey[0] === 4 && auth.length === 16;
  } catch {
    return false;
  }
}

function preferences(body: Record<string, unknown>) {
  return isValidReminderTime(body.reminderTime) && isValidIanaTimezone(body.timezone)
    ? { reminderTime: body.reminderTime, timezone: body.timezone }
    : null;
}

remindersRouter.get("/reminders/status", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const endpoint = endpointFrom(req.query.endpoint);
  const currentDevice = endpoint ? await getReminderSubscription(userId, endpoint) : undefined;
  const savedPreferences = currentDevice ?? await getUserReminderPreferences(userId);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...reminderConfig(),
    reminderTime: savedPreferences?.reminderTime ?? "09:00",
    timezone: savedPreferences?.timezone ?? "Africa/Johannesburg",
    currentDevice: currentDevice
      ? { active: currentDevice.active, endpoint: currentDevice.endpoint }
      : null,
  });
});

remindersRouter.post("/reminders/subscriptions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const body = req.body as Record<string, unknown>;
  if (!validSubscription(body.subscription) || !preferences(body)) {
    res.status(400).json({ error: "subscription, reminderTime (HH:MM), and an IANA timezone are required" });
    return;
  }
  if (!reminderConfig().supported) {
    res.status(503).json({ error: "Push reminders are not configured" });
    return;
  }
  const subscription = body.subscription;
  // Store one canonical endpoint representation so status/unsubscribe work
  // even when a browser supplies an equivalent URL spelling.
  const endpoint = endpointFrom(subscription.endpoint)!;
  const saved = await upsertReminderSubscription(
    userId,
    endpoint,
    JSON.stringify({ ...subscription, endpoint }),
    preferences(body)!,
  );
  if (!saved) {
    res.status(409).json({
      error: "This browser notification subscription belongs to another signed-in account. Reset it on this device and try again.",
    });
    return;
  }
  res.status(201).json({ ok: true });
});

remindersRouter.patch("/reminders/preferences", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const body = req.body as Record<string, unknown>;
  const value = preferences(body);
  if (!value) {
    res.status(400).json({ error: "reminderTime must be HH:MM and timezone must be an IANA timezone" });
    return;
  }
  const updated = await updateReminderPreferences(userId, value);
  res.json({ ok: true, updated });
});

remindersRouter.delete("/reminders/subscriptions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const endpoint = endpointFrom(req.body?.endpoint);
  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }
  await deactivateReminderSubscription(userId, endpoint);
  res.status(204).end();
});

remindersRouter.post("/reminders/test", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const endpoint = endpointFrom(req.body?.endpoint);
  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }
  const subscription = await getOwnedReminderSubscription(userId, endpoint);
  if (!subscription) {
    res.status(404).json({ error: "Reminder subscription not found" });
    return;
  }
  try {
    await sendReminderTest(subscription);
    res.json({ ok: true });
  } catch (err) {
    req.log.warn({ err }, "Reminder test push failed");
    res.status(502).json({ error: "Reminder test delivery failed" });
  }
});