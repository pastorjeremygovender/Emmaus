/**
 * OAuth Token Store — file-based, server-side only
 *
 * Stores YouTube OAuth refresh tokens and cached access tokens.
 * Never exposed to the browser.
 * Location: data/sermons/oauth.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refreshAccessToken, getOAuthConfig } from "./youtube-client.js";

const DATA_DIR = join(process.cwd(), "data", "sermons");
const OAUTH_FILE = join(DATA_DIR, "oauth.json");

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
  try {
    const raw = await readFile(OAUTH_FILE, "utf-8");
    return JSON.parse(raw) as OAuthData;
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
}

export async function storeRefreshToken(refreshToken: string): Promise<void> {
  await writeOAuthData({
    refreshToken,
    authorizedAt: new Date().toISOString(),
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
