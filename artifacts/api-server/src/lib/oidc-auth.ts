import crypto from "node:crypto";
import { db, pool, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  refreshSupabaseSession,
  SupabaseAuthError,
} from "./supabase-auth.js";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RECOVERY_TTL_SECONDS = 15 * 60;
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL,
};

export type SessionUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export type AuthenticatedUser = SessionUser & {
  preferredName: string;
  role: "user" | "admin" | "superAdmin";
};

export interface SessionData {
  user: SessionUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  password_recovery_authorized_until?: number;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

/** Revoke every opaque Emmaus session belonging to one verified subject. */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await pool.query(
    `DELETE FROM sessions WHERE sess -> 'user' ->> 'id' = $1`,
    [userId],
  );
}

/**
 * Consume the one-use, short-lived capability granted only after Supabase
 * verifies a password-recovery link. A routine sign-in cannot change a
 * password through the recovery endpoint.
 */
export async function consumePasswordRecoveryAuthorization(
  sid: string,
): Promise<SessionData | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sid, sid))
      .for("update");
    if (!locked || locked.expire < new Date()) return null;

    const session = parseStoredSession(locked.sess);
    const now = Math.floor(Date.now() / 1000);
    if (
      !session ||
      typeof session.password_recovery_authorized_until !== "number" ||
      session.password_recovery_authorized_until < now
    ) {
      return null;
    }

    const { password_recovery_authorized_until: _consumed, ...consumed } =
      session;
    await tx
      .update(sessionsTable)
      .set({
        sess: consumed as unknown as Record<string, unknown>,
        expire: new Date(Date.now() + SESSION_TTL),
      })
      .where(eq(sessionsTable.sid, sid));
    return consumed;
  });
}

// ─── Concurrency-safe expired-token refresh ────────────────────────────────

/**
 * Result of attempting to obtain a currently-valid session for a request.
 *
 *   - "valid":   The session is (still or now) valid; `session` is the data to
 *                use for this request. This covers three cases that are
 *                indistinguishable to the caller and should all proceed:
 *                the token was not expired, THIS request rotated it, or a
 *                CONCURRENT request rotated it and we reloaded the fresh copy.
 *   - "invalid": The refresh token was genuinely rejected by the provider (or
 *                is missing), and this function removed the locked session row.
 *                The caller should only clear its cookie.
 */
export type SessionRefreshResult =
  | { status: "valid"; session: SessionData }
  | {
      status: "invalid";
      reason:
        | "session_missing"
        | "malformed_session"
        | "missing_refresh_token"
        | "provider_rejected"
        | "provider_unavailable";
      providerStatus?: number;
      providerCode?: string;
    };

function isExpired(session: SessionData, nowSeconds: number): boolean {
  return typeof session.expires_at === "number" && nowSeconds > session.expires_at;
}

/**
 * Parse a raw stored session row (`sess` jsonb) into typed SessionData.
 * Returns null when the shape is not a usable session (no user id).
 * Extracted so the parsing/validation is unit-testable without a database.
 */
export function parseStoredSession(raw: unknown): SessionData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<SessionData>;
  if (!data.user || typeof data.user !== "object") return null;
  if (typeof (data.user as SessionUser).id !== "string") return null;
  if (typeof data.access_token !== "string") return null;
  return data as SessionData;
}

/**
 * Obtain a currently-valid session for `sid`, refreshing provider tokens if the
 * access token has expired.
 *
 * Concurrency contract (safe across multiple server instances sharing one
 * PostgreSQL): the refresh is serialized per SID using a row-level lock
 * (`SELECT ... FOR UPDATE`) inside a single transaction. Only one refresh-token
 * rotation can occur at a time. A request that loses the race BLOCKS on the
 * lock, then reloads the row inside the transaction:
 *
 *   - If a peer already rotated the token (row no longer expired), it uses that
 *     freshly-refreshed session and does NOT touch the (now-consumed, stale)
 *     refresh token.
 *   - Otherwise it performs the rotation itself.
 *
 * A rejected refresh deletes the expired row while its lock is still held, so
 * middleware cannot later erase a session that another request refreshed.
 */
export async function refreshSessionIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionRefreshResult> {
  const now = Math.floor(Date.now() / 1000);

  // Fast path: not expired — no lock, no transaction.
  if (!isExpired(session, now)) {
    return { status: "valid", session };
  }

  return db.transaction(async (tx) => {
    // Serialize per-SID: block until we hold the row lock. Peers attempting a
    // concurrent refresh for the same SID wait here.
    const [locked] = await tx
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sid, sid))
      .for("update");

    if (!locked) {
      // Session was deleted (e.g. logout) while we waited for the lock.
      return { status: "invalid", reason: "session_missing" };
    }
    if (locked.expire < new Date()) {
      await tx.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
      return { status: "invalid", reason: "session_missing" };
    }

    const current = parseStoredSession(locked.sess);
    if (!current?.user?.id) {
      await tx.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
      return { status: "invalid", reason: "malformed_session" };
    }

    const lockNow = Math.floor(Date.now() / 1000);

    // A peer already rotated the token while we waited: use the fresh session,
    // do NOT attempt the (now-consumed) refresh token from our stale copy.
    if (!isExpired(current, lockNow)) {
      return { status: "valid", session: current };
    }

    if (!current.refresh_token) {
      await tx.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
      return { status: "invalid", reason: "missing_refresh_token" };
    }

    try {
      const tokens = await refreshSupabaseSession(current.refresh_token);
      if (!tokens.access_token) {
        throw new Error("Supabase refresh did not return an access token");
      }
      const refreshed: SessionData = {
        ...current,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? current.refresh_token,
        expires_at:
          typeof tokens.expires_in === "number"
            ? lockNow + tokens.expires_in
            : current.expires_at,
      };
      await tx
        .update(sessionsTable)
        .set({
          sess: refreshed as unknown as Record<string, unknown>,
          expire: new Date(Date.now() + SESSION_TTL),
        })
        .where(eq(sessionsTable.sid, sid));
      return { status: "valid", session: refreshed };
    } catch (error) {
      // Delete while retaining the row lock. A stale middleware request can no
      // longer delete a session that a concurrent request just refreshed.
      await tx.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
      if (error instanceof SupabaseAuthError) {
        return {
          status: "invalid",
          reason:
            error.status === 400 || error.status === 401
              ? "provider_rejected"
              : "provider_unavailable",
          providerStatus: error.status,
          providerCode: error.code,
        };
      }
      return { status: "invalid", reason: "provider_unavailable" };
    }
  });
}

/** Roll the opaque browser session cookie forward without changing its SID. */
export function renewSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const sid = req.cookies?.[SESSION_COOKIE];
  return typeof sid === "string" ? sid : undefined;
}
