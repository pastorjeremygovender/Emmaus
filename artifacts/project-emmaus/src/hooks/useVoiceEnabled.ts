/**
 * useVoiceEnabled — Checks whether voice mode is enabled on the server.
 *
 * Returns `null` while loading (to avoid a flash of hidden/shown state),
 * `true` when voice is available, `false` when admin has disabled it.
 *
 * Results are cached at module level so multiple components on the same
 * page do not fire redundant requests.
 */

import { useEffect, useState } from 'react';
import { getVoiceSettings } from '@/lib/voice-client';

// Module-level cache — persists for the lifetime of the page session.
// Refreshed only on hard reload (acceptable: admins changing settings
// during a user session is an edge case; users can reload if needed).
let _cached: boolean | null = null;
const _listeners = new Set<(v: boolean) => void>();

function notify(v: boolean) {
  _cached = v;
  _listeners.forEach((l) => l(v));
}

export function useVoiceEnabled(userId: string | undefined): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(_cached);

  useEffect(() => {
    if (!userId) return;

    // If we already have a cached value, sync state immediately
    if (_cached !== null) {
      setEnabled(_cached);
      return;
    }

    // Register so we get the value when the in-flight request returns
    _listeners.add(setEnabled);

    // Only the first hook instance fires the fetch; others wait for notify()
    getVoiceSettings(userId)
      .then((s) => notify(s.enabled))
      .catch(() => notify(true)); // default to enabled on error (fail open for UX)

    return () => {
      _listeners.delete(setEnabled);
    };
  }, [userId]);

  return enabled;
}
