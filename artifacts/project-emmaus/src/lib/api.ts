/**
 * API URL helper
 *
 * Constructs fully-qualified API URLs using the app's BASE_URL so that
 * all requests are routed through the correct path prefix in the Replit proxy.
 */

export function getApiBase(): string {
  return (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL?.replace(/\/$/, '') ?? '';
}

export function getApiUrl(path: string): string {
  // The API is a separate artifact mounted at /api. Prefixing API requests
  // with the web artifact base path returns the Vite HTML fallback instead.
  if (path === '/api' || path.startsWith('/api/')) return path;
  return `${getApiBase()}${path}`;
}

/**
 * Returns the correct public-facing origin for this app.
 *
 * Inside the Replit proxy, `window.location.origin` resolves to the container's
 * internal hostname (e.g. localhost) rather than the public *.replit.dev domain.
 * When REPLIT_DEV_DOMAIN is injected at build time we prefer that; otherwise we
 * fall back to `window.location.origin` which is correct in production.
 */
export function getPublicOrigin(): string {
  const replitDomain = (import.meta.env as Record<string, string>).REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    return `https://${replitDomain}`;
  }
  return window.location.origin;
}

/**
 * Builds an absolute public URL for a given path (relative to the app root).
 * The path should start with a leading slash, e.g. "/join-room/token".
 */
export function getPublicUrl(path: string): string {
  const base = getApiBase(); // e.g. "" or "/project-emmaus"
  return `${getPublicOrigin()}${base}${path}`;
}
