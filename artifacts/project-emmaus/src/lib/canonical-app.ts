export const EMMAUS_PRODUCTION_ORIGIN = 'https://emmaus.co.za';
export const EMMAUS_APP_PATH = '/app';
export const EMMAUS_APP_URL = `${EMMAUS_PRODUCTION_ORIGIN}${EMMAUS_APP_PATH}`;

/**
 * Build a public Emmaus URL that never leaks a Replit or preview hostname.
 */
export function canonicalEmmausUrl(path = '/'): string {
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/';
  return `${EMMAUS_PRODUCTION_ORIGIN}${safePath}`;
}

/** Keep the current deep path while replacing preview/dev origins. */
export function canonicalCurrentEmmausUrl(): string {
  if (typeof window === 'undefined') return EMMAUS_PRODUCTION_ORIGIN;
  return canonicalEmmausUrl(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}
