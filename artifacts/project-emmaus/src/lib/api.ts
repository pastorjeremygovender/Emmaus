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
  const base = getApiBase();
  // path should start with /api/...
  return `${base}${path}`;
}
