import { safeGroupInviteDestination } from './groups-invite';

const PENDING_DESTINATION_KEY = 'emmaus_pending_opening_destination_v1';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isPublicPath(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/auth' ||
    pathname === '/auth/callback' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/join-room/') ||
    pathname.startsWith('/groups/join/');
}

/** Only internal, known app URLs can be held while Daily Rhythm opens. */
export function safeOpeningDestination(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 800 || !raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/admin') || raw.startsWith('/auth')) return null;
  const parsed = new URL(raw, window.location.origin);
  if (parsed.origin !== window.location.origin) return null;
  const isValidatedInvite = Boolean(safeGroupInviteDestination(
    `${parsed.pathname}${parsed.search}${parsed.hash}`,
  ));
  if ((isPublicPath(parsed.pathname) && !isValidatedInvite) || isAdminPath(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function rememberOpeningDestination(path: string): void {
  const safe = safeOpeningDestination(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(PENDING_DESTINATION_KEY, safe);
  } catch {
    // A missing pending destination never changes the server decision.
  }
}

export function consumeOpeningDestination(fallback = '/walk'): string {
  try {
    const safe = safeOpeningDestination(sessionStorage.getItem(PENDING_DESTINATION_KEY));
    sessionStorage.removeItem(PENDING_DESTINATION_KEY);
    return safe ?? fallback;
  } catch {
    return fallback;
  }
}