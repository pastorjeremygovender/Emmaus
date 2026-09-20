import { EMMAUS_PRODUCTION_ORIGIN } from '@/lib/canonical-app';

export { EMMAUS_PRODUCTION_ORIGIN } from '@/lib/canonical-app';
export const GROUP_INVITE_PATH_PREFIX = '/groups/join/';

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;

export function isValidInviteToken(token: string | null | undefined): token is string {
  return Boolean(token && INVITE_TOKEN_PATTERN.test(token));
}

export function groupInvitePath(token: string): string {
  if (!isValidInviteToken(token)) throw new Error('Invalid group invitation token');
  return `${GROUP_INVITE_PATH_PREFIX}${encodeURIComponent(token)}`;
}

export function groupInviteUrl(token: string): string {
  return `${EMMAUS_PRODUCTION_ORIGIN}${groupInvitePath(token)}`;
}

/** Accept both the current link format and the legacy /join-room format. */
export function extractGroupInviteToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/^\/(?:groups\/join|join-room)\/([^/]+)$/);
    const token = match ? decodeURIComponent(match[1]) : null;
    return isValidInviteToken(token) ? token : null;
  } catch {
    return null;
  }
}

export function safeGroupInviteDestination(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300 || !raw.startsWith('/') || raw.startsWith('//')) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const match = url.pathname.match(/^\/(?:groups\/join|join-room)\/([^/]+)$/);
    const token = match ? decodeURIComponent(match[1]) : null;
    if (!isValidInviteToken(token)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const PENDING_INVITE_KEY = 'emmaus_pending_group_invite_v1';

export function rememberGroupInvite(destination: string): void {
  const safe = safeGroupInviteDestination(destination);
  if (!safe) return;
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, safe);
    localStorage.setItem(PENDING_INVITE_KEY, safe);
    sessionStorage.setItem('pendingInviteToken', extractGroupInviteToken(safe) ?? '');
  } catch {
    // Invitation context is best effort; the URL remains the source of truth.
  }
}

export function consumeGroupInvite(): string | null {
  try {
    const safe =
      safeGroupInviteDestination(sessionStorage.getItem(PENDING_INVITE_KEY)) ??
      safeGroupInviteDestination(localStorage.getItem(PENDING_INVITE_KEY));
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    localStorage.removeItem(PENDING_INVITE_KEY);
    sessionStorage.removeItem('pendingInviteToken');
    return safe;
  } catch {
    return null;
  }
}
