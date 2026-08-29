import crypto from "node:crypto";

export const REMINDER_WORKER_PATH = "/api/internal/reminders/deliver";
export const REMINDER_WORKER_MAX_SKEW_MS = 2 * 60 * 1000;

type Verification =
  | { ok: true; nonce: string; requestedAt: Date }
  | { ok: false; reason: "not-configured" | "unauthorized" };

function canonicalRequest(timestamp: string, nonce: string): string {
  return `POST\n${REMINDER_WORKER_PATH}\n${timestamp}\n${nonce}`;
}

export function signReminderWorkerRequest(
  secret: string,
  timestamp: string,
  nonce: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(canonicalRequest(timestamp, nonce))
    .digest("hex");
}

export function verifyReminderWorkerRequest(
  headers: {
    timestamp?: string;
    nonce?: string;
    signature?: string;
  },
  nowMs = Date.now(),
): Verification {
  const secret = process.env.REMINDER_WORKER_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    return { ok: false, reason: "not-configured" };
  }

  const timestamp = headers.timestamp?.trim() ?? "";
  const nonce = headers.nonce?.trim() ?? "";
  const signature = headers.signature?.trim().toLowerCase() ?? "";
  if (
    !/^\d{13}$/.test(timestamp) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return { ok: false, reason: "unauthorized" };
  }

  const requestedAtMs = Number(timestamp);
  if (
    !Number.isSafeInteger(requestedAtMs) ||
    Math.abs(nowMs - requestedAtMs) > REMINDER_WORKER_MAX_SKEW_MS
  ) {
    return { ok: false, reason: "unauthorized" };
  }

  const expected = Buffer.from(
    signReminderWorkerRequest(secret, timestamp, nonce),
    "hex",
  );
  const received = Buffer.from(signature, "hex");
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return { ok: false, reason: "unauthorized" };
  }

  return { ok: true, nonce, requestedAt: new Date(requestedAtMs) };
}