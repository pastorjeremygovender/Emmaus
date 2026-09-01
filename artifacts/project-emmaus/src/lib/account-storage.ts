/**
 * Browser storage used for member-specific state must always be owned by the
 * verified Supabase subject. Unscoped keys from older releases are deliberately
 * retired rather than imported into whichever account signs in next.
 */

export const SESSION_SUBJECT_KEY = 'emmaus_session_subject';

const UNOWNED_PERSONAL_KEYS = [
  'emmaus_progress',
  'emmaus_reflections',
  'emmaus_onboarded',
  'emmaus_enrollment',
  'emmaus_last_opened_v2',
  'emmaus_last_opened_v3',
  'emmaus_opening_resolved_v1',
  'emmaus_bible_notes',
  'emmaus_bible_highlights',
  'emmaus_bible_completed',
  'emmaus_bible_journey_progress',
  'emmaus_bible_reflections',
  'emmaus_bible_bookmarks_v2',
  'emmaus_bible_history',
  'emmaus_bible_history_v1',
  'emmaus_bible_history_v2',
  'emmaus_bible_favourites',
  'emmaus_bible_collections',
  'emmaus_bible_prayers',
  'emmaus_bible_reading_positions_v1',
  'emmaus_admin_sermons',
  'emmaus_admin_prayers',
  'emmaus_admin_settings',
  'emmaus_media_kits',
  'emmaus_media_assets',
] as const;

const UNOWNED_PERSONAL_PREFIXES = [
  'emmaus_audio_pos_',
  'emmaus_ack_session_',
] as const;

export function accountStorageKey(baseKey: string, subject: string): string {
  if (!subject) {
    throw new Error(`Cannot create an account storage key without a verified subject (${baseKey})`);
  }
  return `emmaus_account:${subject}:${baseKey}`;
}

export function roomSessionAckKey(subject: string, sessionId: string): string {
  return accountStorageKey(`emmaus_ack_session_${sessionId}`, subject);
}

export function retireUnownedPersonalStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    for (const key of UNOWNED_PERSONAL_KEYS) {
      window.localStorage.removeItem(key);
    }

    const prefixedKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && UNOWNED_PERSONAL_PREFIXES.some(prefix => key.startsWith(prefix))) {
        prefixedKeys.push(key);
      }
    }
    for (const key of prefixedKeys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function clearSessionAccountState(): void {
  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && (key.startsWith('emmaus_') || key === 'pendingInviteToken')) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}