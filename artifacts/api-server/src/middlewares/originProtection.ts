import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE } from "../lib/oidc-auth.js";
import { isCanonicalRequestOrigin } from "../lib/public-origin.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function protectCookieAuthenticatedMutation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method) || !req.cookies?.[SESSION_COOKIE]) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin !== "string" || !isCanonicalRequestOrigin(origin)) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return;
  }

  next();
}