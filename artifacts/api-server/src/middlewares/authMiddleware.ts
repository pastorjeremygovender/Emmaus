import type { NextFunction, Request, Response } from "express";
import {
  clearSession,
  getSession,
  getSessionId,
  refreshSessionIfExpired,
  type AuthenticatedUser,
} from "../lib/oidc-auth.js";
import { getUserProfileBySubject } from "../lib/user-role-store.js";

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
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = result.session;
  // Role is always resolved from the database on every request (never trusted
  // from the session blob).
  const profile = await getUserProfileBySubject(refreshed.user.id);
  req.user = {
    ...refreshed.user,
    preferredName:
      profile?.preferredName ||
      refreshed.user.firstName ||
      "",
    role: profile?.appRole ?? "user",
  };
  next();
}