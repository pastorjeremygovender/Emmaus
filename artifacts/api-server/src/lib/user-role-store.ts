/**
 * user-role-store.ts — Server-side role registry for Emmaus users.
 *
 * Roles are stored in data/user-roles.json and validated here — never from
 * client-provided request headers. Routes use getUserRole() to derive admin
 * access; they do not trust X-User-Role.
 *
 * Seeded with the known demo admin / superAdmin accounts at startup.
 * Production upgrade path: replace the file store with a PostgreSQL users table.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";

const ROLES_FILE = join(process.cwd(), "data", "user-roles.json");

type UserRole = "user" | "admin" | "superAdmin";

// ─── Known demo users (seeded on first access) ────────────────────────────────
// These mirror the demo accounts in the frontend (demo-data.ts).
const SEED_ROLES: Record<string, UserRole> = {
  "demo-admin-1": "admin",
  "demo-superadmin-1": "superAdmin",
  "demo-pastor-1": "admin",
};

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cache: Record<string, UserRole> | null = null;

async function loadRoles(): Promise<Record<string, UserRole>> {
  if (cache) return cache;

  if (existsSync(ROLES_FILE)) {
    try {
      const raw = await readFile(ROLES_FILE, "utf-8");
      cache = { ...SEED_ROLES, ...(JSON.parse(raw) as Record<string, UserRole>) };
      return cache;
    } catch {
      // Fall through to seed-only
    }
  }

  // First boot: write seed file
  cache = { ...SEED_ROLES };
  await writeFile(ROLES_FILE, JSON.stringify(cache, null, 2), "utf-8");
  logger.info({ count: Object.keys(cache).length }, "user-role-store: seeded roles file");
  return cache;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the server-verified role for a userId, or 'user' if not in the store.
 */
export async function getUserRole(userId: string): Promise<UserRole> {
  const roles = await loadRoles();
  return roles[userId] ?? "user";
}

/**
 * Sets a role for a userId (persisted to disk).
 * Only superAdmin callers should invoke this in application code.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const roles = await loadRoles();
  roles[userId] = role;
  cache = roles;
  await writeFile(ROLES_FILE, JSON.stringify(roles, null, 2), "utf-8");
}

/**
 * Returns true when the userId has admin or superAdmin role in the server store.
 * Never relies on request headers.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === "admin" || role === "superAdmin";
}
