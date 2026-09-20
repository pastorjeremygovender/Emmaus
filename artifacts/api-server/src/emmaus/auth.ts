import type { Request } from "express";

type AuthResponse = {
  status: (code: number) => { json: (body: object) => void };
};

/** Identity is accepted only from the server-populated OIDC session. */
export function extractUserId(req: Request): string | null {
  return req.user?.id ?? null;
}

export function requireAuth(
  req: Request,
  res: AuthResponse,
): string | null {
  const userId = extractUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  return userId;
}

export function requireAdmin(
  req: Request,
  res: AuthResponse,
): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (req.user?.role !== "admin" && req.user?.role !== "superAdmin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return userId;
}

export function requireSuperAdmin(
  req: Request,
  res: AuthResponse,
): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (req.user?.role !== "superAdmin") {
    res.status(403).json({
      error: "Permanent deletion requires Super Administrator access.",
    });
    return null;
  }
  return userId;
}

export function isOwner(
  callerId: string | null,
  resourceOwnerId: string | null,
): boolean {
  if (!callerId || !resourceOwnerId) return false;
  return callerId === resourceOwnerId;
}