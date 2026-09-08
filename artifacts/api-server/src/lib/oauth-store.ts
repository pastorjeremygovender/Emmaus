/**
 * OAuth Token Store — file-based, server-side only
 *
 * Stores YouTube OAuth refresh tokens, cached access tokens, and
 * pending CSRF state values.  File-based so state survives hot-reloads
 * and process restarts that would wipe an in-memory Map.
 * Never exposed to the browser.
 * Location: data/sermons/oauth.json, data/sermons/oauth-states.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { refreshAccessToken, getOAuthConfig } from "./youtube-client.js";
import { readArchiveState, writeArchiveState } from "./archive-state-store.js";

// Resolve beside the compiled server instead of process.cwd(). Autoscale
// instances may start from different working directories.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "sermons");
const OAUTH_FILE = join(DATA_DIR, "oauth.json");
const STATES_FILE = join(DATA_DIR, "oauth-states.json");

interface OAuthData {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;    // ms epoch
  authorizedAt: string;
}

async function ensureDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readOAuthData(): Promise<OAuthData | null> {
  const durable = await readArchiveState<OAuthData>("oauth");
  // A partially-written/legacy durable record must not mask a valid token file.
  // This also lets an instance recover after a transient database write failure.
  if (durable?.refreshToken) return durable;
  try {
    const raw = await readFile(OAUTH_FILE, "utf-8");
    const data = JSON.parse(raw) as OAuthData;
    if (data?.refreshToken) await writeArchiveState("oauth", data);
    return data;
  } catch {
    return null;
  }
}

async function writeOAuthData(data: OAuthData): Promise<void> {
  await ensureDir();
  const tmp = `${OAUTH_FILE}.tmp.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, OAUTH_FILE);
  await writeArchiveState("oauth", data);
}

// ─── Pending CSRF state persistence ──────────────────────────────────────────
// State values are written to a file so they survive hot-reloads and process
// restarts.  An in-memory Map is cleared on every reload, which is the root
// cause of "Invalid or expired OAuth state" errors in development.

interface PendingStates {
  [state: string]: number; // state → expiresAt (ms epoch)
}

async function readStates(): Promise<PendingStates> {
  try {
    const raw = await readFile(STATES_FILE, "utf-8");
    return JSON.parse(raw) as PendingStates;
  } catch {
    return {};
  }
}

async function writeStates(states: PendingStates): Promise<void> {
  await ensureDir();
  const tmp = `${STATES_FILE}.tmp.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(states), "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, STATES_FILE);
}

/** Add a new CSRF state with a 10-minute TTL. */
export async function addPendingState(state: string): Promise<void> {
  const states = await readStates();
  // Prune expired entries while we have the file open.
  const now = Date.now();
  for (const [k, exp] of Object.entries(states)) {
    if (exp < now) delete states[k];
  }
  states[state] = now + 10 * 60 * 1000;
  await writeStates(states);
}

/**
 * Verify that `state` is present and unexpired, then delete it so it
 * cannot be replayed.  Returns true if valid, false otherwise.
 */
export async function verifyAndConsumePendingState(state: string): Promise<boolean> {
  const states = await readStates();
  const exp = states[state];
  // Always clean up expired entries.
  const now = Date.now();
  for (const [k, e] of Object.entries(states)) {
    if (e < now) delete states[k];
  }
  const valid = typeof exp === "number" && exp >= now;
  if (valid) delete states[state];
  await writeStates(states);
  return valid;
}

// ─── Token storage ────────────────────────────────────────────────────────────

export async function storeRefreshToken(refreshToken: string): Promise<void> {
  const existing = await readOAuthData();
  await writeOAuthData({
    ...existing,
    refreshToken,
    authorizedAt: existing?.authorizedAt ?? new Date().toISOString(),
  });
}

export async function hasOAuthCredentials(): Promise<boolean> {
  const data = await readOAuthData();
  return !!data?.refreshToken;
}

export async function getValidAccessToken(): Promise<string | null> {
  const data = await readOAuthData();
  if (!data?.refreshToken) return null;

  // Return cached token if still valid (with 60s buffer)
  if (data.accessToken && data.expiresAt && data.expiresAt > Date.now() + 60_000) {
    return data.accessToken;
  }

  // Refresh
  const config = getOAuthConfig();
  if (!config) return null;

  try {
    const { accessToken, expiresAt } = await refreshAccessToken(data.refreshToken, config);
    await writeOAuthData({ ...data, accessToken, expiresAt });
    return accessToken;
  } catch {
    return null;
  }
}

export async function clearOAuthCredentials(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(OAUTH_FILE);
  } catch {
    // Already gone
  }
  await writeArchiveState("oauth", null);
}

export async function getOAuthStatus(): Promise<{
  connected: boolean;
  authorizedAt?: string;
  oauthConfigured: boolean;
}> {
  const data = await readOAuthData();
  const config = getOAuthConfig();
  return {
    connected: !!data?.refreshToken,
    authorizedAt: data?.authorizedAt,
    oauthConfigured: !!config,
  };
}
