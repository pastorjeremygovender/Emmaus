/**
 * Emmaus Auth Utilities
 *
 * Derives caller identity from the request using a signed session cookie
 * (SESSION_SECRET HMAC) or the X-User-Id header in dev/demo mode.
 *
 * NEVER trusts userId from the request body or query string for authorization.
 * The body's context.userId field is used only for human-readable display inside
 * the LLM context string — not for access control decisions.
 *
 * Production upgrade path:
 *   Replace extractUserId() with Firebase ID-token validation:
 *     const decoded = await admin.auth().verifyIdToken(req.headers.authorization.split(' ')[1]);
 *     return decoded.uid;
 */

import type { Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

// ─── Cookie Signing ───────────────────────────────────────────────────────────

const COOKIE_NAME = "emmaus_uid";
const SEP = ".";

function sign(value: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
  return `${value}${SEP}${sig}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(SEP);
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = Buffer.from(sign(value), "utf8");
  const provided = Buffer.from(signed, "utf8");
  if (expected.length !== provided.length) return null;
  try {
    if (!timingSafeEqual(expected, provided)) return null;
  } catch {
    return null;
  }
  return value;
}

// ─── Cookie Issuance ─────────────────────────────────────────────────────────

/**
 * Set a signed session cookie binding this response to the given userId.
 * Call this after a user is identified on their first request.
 */
export function setUserCookie(res: { cookie: Function }, userId: string): void {
  if (!SESSION_SECRET) return; // skip if no secret configured
  res.cookie(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === "production",
  });
}

// ─── Identity Extraction ──────────────────────────────────────────────────────

/**
 * Extract the caller's userId from the request, in priority order:
 *  1. Signed session cookie (emmaus_uid) — set by a prior startEmmausConversation call
 *  2. X-User-Id header — used in dev/demo mode, or before the first cookie is issued
 *
 * Returns null when no trusted identity is present.
 * Routes that require authentication must call requireAuth() and return 401 on null.
 *
 * IMPORTANT: Never promote body/query userId to an auth decision.
 */
export function extractUserId(req: Request): string | null {
  // 1. Signed session cookie
  const raw = req.cookies?.[COOKIE_NAME];
  if (raw && SESSION_SECRET) {
    const userId = unsign(String(raw));
    if (userId) return userId;
  }

  // 2. X-User-Id header (demo mode / pre-cookie bootstrap)
  const header = req.headers["x-user-id"];
  if (header && typeof header === "string" && header.trim()) {
    return header.trim();
  }
  if (Array.isArray(header) && header[0]) {
    return header[0].trim();
  }

  return null;
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────

/**
 * Extracts the caller's userId and replies 401 when no identity is present.
 * Use this on any route that needs an authenticated caller.
 *
 * Returns the userId string on success, null when a 401 has already been sent.
 */
export function requireAuth(
  req: Request,
  res: { status: (code: number) => { json: (body: object) => void } }
): string | null {
  const userId = extractUserId(req);
  if (!userId) {
    res.status(401).json({
      error: "Authentication required. Provide an X-User-Id header (dev) or a valid session cookie.",
    });
    return null;
  }
  return userId;
}

// ─── Super-Admin Guard ────────────────────────────────────────────────────────

/**
 * In demo mode the frontend passes X-User-Role: superAdmin alongside X-User-Id.
 * Production upgrade path: verify the role claim from a JWT or database lookup
 * before trusting it — never rely on a client-provided header in production.
 *
 * Returns the userId on success. Sends 401 (no identity) or 403 (wrong role)
 * and returns null when access is denied.
 */
export function requireSuperAdmin(
  req: Request,
  res: { status: (code: number) => { json: (body: object) => void } }
): string | null {
  const userId = extractUserId(req);
  if (!userId) {
    res.status(401).json({
      error: "Authentication required.",
    });
    return null;
  }

  // Check role claim from header (demo mode) or known super-admin userId
  const roleClaim = req.headers["x-user-role"];
  const isSuperAdmin =
    roleClaim === "superAdmin" ||
    userId === "demo-superadmin-1"; // demo fallback

  if (!isSuperAdmin) {
    res.status(403).json({
      error: "Permanent deletion requires Super Administrator access.",
    });
    return null;
  }

  return userId;
}

// ─── Ownership Guard ──────────────────────────────────────────────────────────

/**
 * Returns true only when both caller and resource owner are known
 * (non-null, non-empty) and they match.
 * Rejects any null/empty userId — prevents shared-anonymous bucket collisions.
 */
export function isOwner(callerId: string | null, resourceOwnerId: string | null): boolean {
  if (!callerId || !resourceOwnerId) return false;
  return callerId === resourceOwnerId;
}
