/**
 * Development Mode — Daily Rhythm schedule bypass for authorised accounts.
 *
 * Two conditions must both be true for dev mode to be active:
 *  1. The user holds an authorised role: 'admin' or 'superAdmin'.
 *  2. The user has explicitly enabled the toggle (stored per-user in localStorage).
 *
 * This module is the SINGLE SOURCE OF TRUTH for every calendar-lock bypass
 * decision in the app. All components import isDevelopmentMode from here —
 * no hard-coded role checks elsewhere.
 *
 * What dev mode bypasses:
 *  – "ahead of rhythm" calendar gate
 *  – "available tomorrow" state on the Walk card
 *  – PreviousDays filter (shows all Published days, not just day < currentDay)
 *
 * What dev mode does NOT bypass:
 *  – completeStep / progress writes (opening a day doesn't mark it complete)
 *  – Replay mode (day < currentDay is still read-only unless explicitly completed)
 *  – Draft/unpublished content (still hidden)
 *  – Streak calculations, member analytics
 */

// ─── Storage keys ──────────────────────────────────────────────────────────────
const toggleKey = (userId: string) => `emmaus_dev_mode_${userId}`;
const auditKey  = (userId: string) => `emmaus_dev_audit_${userId}`;
const AUDIT_MAX = 50;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DevAuditEntry {
  id: string;
  adminId: string;
  action: string;
  timestamp: string; // ISO 8601
  previousState?: string;
  newState?: string;
}

// ─── Role authorisation ───────────────────────────────────────────────────────
/**
 * True when this user's role permits access to Development Mode controls.
 * Does NOT mean dev mode is currently on.
 */
export function isDevModeAuthorized(
  user: { role: string } | null | undefined
): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'superAdmin';
}

// ─── Per-user toggle (localStorage) ──────────────────────────────────────────
export function getDevModeEnabled(userId: string): boolean {
  try {
    return localStorage.getItem(toggleKey(userId)) === 'true';
  } catch {
    return false;
  }
}

export function setDevModeEnabled(
  userId: string,
  enabled: boolean,
): void {
  const previous = getDevModeEnabled(userId);
  try {
    if (enabled) {
      localStorage.setItem(toggleKey(userId), 'true');
    } else {
      localStorage.removeItem(toggleKey(userId));
    }
  } catch { /* ignore */ }
  logDevAction(userId, enabled ? 'dev_mode_enabled' : 'dev_mode_disabled', {
    previousState: String(previous),
    newState: String(enabled),
  });
}

// ─── Primary export ───────────────────────────────────────────────────────────
/**
 * Returns true when:
 *   – user has an authorised role (admin | superAdmin), AND
 *   – user has explicitly toggled Development Mode on.
 *
 * Import and call this everywhere a calendar-lock bypass is needed.
 */
export function isDevelopmentMode(
  user: { id: string; role: string } | null | undefined
): boolean {
  if (!isDevModeAuthorized(user)) return false;
  if (!user?.id) return false;
  return getDevModeEnabled(user.id);
}

// ─── Audit log ────────────────────────────────────────────────────────────────
/**
 * Record a development action.
 * Never store devotional text, prayers or private user content.
 */
export function logDevAction(
  adminId: string,
  action: string,
  extra?: { previousState?: string; newState?: string }
): void {
  try {
    const entries = getDevAuditLog(adminId);
    const entry: DevAuditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      adminId,
      action,
      timestamp: new Date().toISOString(),
      previousState: extra?.previousState,
      newState: extra?.newState,
    };
    const updated = [entry, ...entries].slice(0, AUDIT_MAX);
    localStorage.setItem(auditKey(adminId), JSON.stringify(updated));
  } catch { /* ignore */ }
}

export function getDevAuditLog(adminId: string): DevAuditEntry[] {
  try {
    const raw = localStorage.getItem(auditKey(adminId));
    if (!raw) return [];
    return JSON.parse(raw) as DevAuditEntry[];
  } catch {
    return [];
  }
}

export function clearDevAuditLog(adminId: string): void {
  try {
    localStorage.removeItem(auditKey(adminId));
  } catch { /* ignore */ }
}
