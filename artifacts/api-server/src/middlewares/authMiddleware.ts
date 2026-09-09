import type { NextFunction, Request, Response } from "express";
import {
  clearSession,
  getSession,
  getSessionId,
  refreshSessionIfExpired,
  renewSessionCookie,
  type AuthenticatedUser,
} from "../lib/oidc-auth.js";
import { logger } from "../lib/logger.js";
import { isPermanentlyDeletedAccount } from "../lib/account-lifecycle-store.js";
import { getUserProfileBySubject } from "../lib/user-role-store.js";

const EXPECTED_SUBJECT_HEADER = "x-emmaus-expected-subject";
const SUBJECT_ASSERTION_EXEMPT_PATHS = new Set([
  "/api/auth/user",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/recover",
]);

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User;
    }

    interface AuthedRequest {
      user: User;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const result = await refreshSessionIfExpired(sid, session);
  if (result.status !== "valid") {
    logger.warn(
      {
        event: "auth_session_refresh_failed",
        route: req.path,
        correlationId: typeof req.id === "string" ? req.id : "unknown",
        reason: result.reason,
        providerStatus: result.providerStatus,
        providerCode: result.providerCode,
        buildId:
          process.env.REPLIT_DEPLOYMENT_ID ??
          process.env.REPLIT_BUILD_ID ??
          process.env.REPLIT_COMMIT_SHA ??
          "unknown",
      },
      "Supabase session refresh failed",
    );
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = result.session;
  // Role is always resolved from the database on every request (never trusted
  // from the session blob).
  const profile = await getUserProfileBySubject(refreshed.user.id);
  // A session is never sufficient evidence of a current account. This blocks
  // both removed profiles and a rare login-vs-permanent-purge race where a
  // late opaque session could otherwise outlive its deleted profile.
  if (
    !profile ||
    profile.accountStatus === "removed" ||
    await isPermanentlyDeletedAccount(refreshed.user.id)
  ) {
    await clearSession(res, sid);
    next();
    return;
  }
  req.user = {
    ...refreshed.user,
    preferredName:
      profile?.preferredName ||
      refreshed.user.firstName ||
      "",
    role: profile?.appRole ?? "user",
  };
  renewSessionCookie(res, sid);

  const expectedSubject = req.get(EXPECTED_SUBJECT_HEADER)?.trim();
  if (
    expectedSubject &&
    expectedSubject !== req.user.id &&
    !SUBJECT_ASSERTION_EXEMPT_PATHS.has(req.path)
  ) {
    res.status(409).json({
      error: "Your signed-in account changed. Please try again.",
      code: "AUTH_SUBJECT_MISMATCH",
    });
    return;
  }
  next();
}