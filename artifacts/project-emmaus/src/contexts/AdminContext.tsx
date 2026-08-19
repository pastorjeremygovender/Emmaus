import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Sermon,
  PrayerRequest,
  AdminUser,
  ChurchSettings,
  DEMO_SERMON_RECORD,
  DEMO_PRAYER_REQUESTS,
  DEMO_ADMIN_USERS,
  DEMO_CHURCH_SETTINGS,
} from '../lib/admin-demo-data';
import {
  listServerSermons,
  saveServerSermon,
  patchServerSermon,
  deleteServerSermon,
  type AdminSermonRecord,
} from '../lib/sermon-generator-api';
import { useAuth } from './AuthContext';
import { accountStorageKey } from '@/lib/account-storage';

type AdminContextType = {
  sermons: Sermon[];
  /** skipServerPersist: set true when the sermon is already saved in the canonical DB
   *  (e.g. generator-created) to avoid writing a redundant JSON shadow record. */
  addSermon: (sermon: Sermon, opts?: { skipServerPersist?: boolean }) => void;
  updateSermon: (sermon: Sermon) => void;
  removeSermon: (id: string) => void;
  prayerRequests: PrayerRequest[];
  updatePrayerRequest: (req: PrayerRequest) => void;
  adminUsers: AdminUser[];
  settings: ChurchSettings;
  updateSettings: (s: ChurchSettings) => void;
};

const AdminContext = createContext<AdminContextType | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeSermons(local: Sermon[], server: AdminSermonRecord[]): Sermon[] {
  // Start with local records (they may have pastoral edits)
  const byId = new Map<string, Sermon>(local.map(s => [s.id, s]));

  // Add any server-saved records not present locally (recovery path after
  // browser/localStorage clears — this is what makes generated drafts durable)
  for (const r of server) {
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id,
        title: r.title,
        speaker: r.speaker,
        sermonDate: r.sermonDate,
        series: r.series,
        scriptureReference: r.scriptureReference,
        youtubeUrl: r.youtubeUrl,
        summary: r.summary,
        topics: r.topics ?? [],
        keywords: r.keywords ?? [],
        transcript: r.transcript,
        sermonTranscript: r.sermonTranscript,
        sermonStartTime: r.sermonStartTime,
        sermonEndTime: r.sermonEndTime,
        detectionConfidence: r.detectionConfidence,
        detectionMethod: r.detectionMethod,
        transcriptStatus: r.transcriptStatus ?? 'none',
        aiIndexStatus: r.aiIndexStatus ?? 'none',
        companionJourneyId: r.companionJourneyId,
        status: r.status ?? 'draft',
        pastorEdited: r.pastorEdited ?? false,
        updatedAt: r.updatedAt,
      });
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [adminUsers] = useState<AdminUser[]>(DEMO_ADMIN_USERS);
  const [settings, setSettings] = useState<ChurchSettings>(DEMO_CHURCH_SETTINGS);
  const [loadedSubject, setLoadedSubject] = useState<string | null>(null);

  // Build auth headers from current user — used for API calls
  const authHeaders = user
    ? { userId: user.id, userRole: user.role }
    : null;
  const storageKey = useCallback(
    (baseKey: string) => user?.id ? accountStorageKey(baseKey, user.id) : null,
    [user?.id],
  );

  // Load only the current verified admin's owned browser cache.
  useEffect(() => {
    const sermonKey = storageKey('emmaus_admin_sermons');
    const prayerKey = storageKey('emmaus_admin_prayers');
    const settingsKey = storageKey('emmaus_admin_settings');
    if (!sermonKey || !prayerKey || !settingsKey) {
      setSermons([]);
      setPrayerRequests([]);
      setSettings(DEMO_CHURCH_SETTINGS);
      setLoadedSubject(null);
      return;
    }
    const s = localStorage.getItem(sermonKey);
    setSermons(s ? JSON.parse(s) : [DEMO_SERMON_RECORD]);

    const p = localStorage.getItem(prayerKey);
    setPrayerRequests(p ? JSON.parse(p) : DEMO_PRAYER_REQUESTS);

    const cfg = localStorage.getItem(settingsKey);
    setSettings(cfg ? JSON.parse(cfg) : DEMO_CHURCH_SETTINGS);
    setLoadedSubject(user?.id ?? null);
  }, [storageKey, user?.id]);

  // ── Effect 2: reconcile with server once authenticated identity is known ──────
  // Runs whenever the userId changes (including the initial auth-hydration from
  // localStorage). This is the recovery path for browser/localStorage clears —
  // any server-persisted generated draft that isn't in localStorage is merged in.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const subject = user.id;
    const auth = { userId: user.id, userRole: user.role };
    listServerSermons(auth).then(serverSermons => {
      if (cancelled || serverSermons.length === 0) return;
      setSermons(prev => {
        const merged = mergeSermons(prev, serverSermons);
        localStorage.setItem(
          accountStorageKey('emmaus_admin_sermons', subject),
          JSON.stringify(merged),
        );
        return merged;
      });
    }).catch(() => {
      // Non-fatal — fall back to localStorage-only when server is unreachable
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  const addSermon = useCallback((sermon: Sermon, opts?: { skipServerPersist?: boolean }) => {
    setSermons(prev => {
      const next = [...prev, sermon];
      const key = storageKey('emmaus_admin_sermons');
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
    // Best-effort server persist (non-blocking).
    // Skip when the sermon is already in the canonical DB (e.g. generator-created)
    // to avoid writing a redundant JSON shadow record.
    if (authHeaders && !opts?.skipServerPersist) {
      const record: AdminSermonRecord = {
        ...sermon,
        createdAt: sermon.updatedAt,
      };
      saveServerSermon(record, authHeaders).catch(() => {});
    }
  }, [authHeaders, storageKey]);

  const updateSermon = useCallback((sermon: Sermon) => {
    setSermons(prev => {
      const next = prev.map(s => (s.id === sermon.id ? sermon : s));
      const key = storageKey('emmaus_admin_sermons');
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
    // Best-effort server sync (non-blocking)
    if (authHeaders) {
      patchServerSermon(sermon.id, { ...sermon }, authHeaders).catch(() => {});
    }
  }, [authHeaders, storageKey]);

  /**
   * Remove a sermon from local state (and localStorage).
   * Callers are responsible for the server-side delete — they need to handle
   * the async result and navigate away before calling this.
   */
  const removeSermon = useCallback((id: string) => {
    setSermons(prev => {
      const next = prev.filter(s => s.id !== id);
      const key = storageKey('emmaus_admin_sermons');
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const updatePrayerRequest = (req: PrayerRequest) => {
    const next = prayerRequests.map(p => (p.id === req.id ? req : p));
    setPrayerRequests(next);
    const key = storageKey('emmaus_admin_prayers');
    if (key) localStorage.setItem(key, JSON.stringify(next));
  };

  const updateSettings = (s: ChurchSettings) => {
    setSettings(s);
    const key = storageKey('emmaus_admin_settings');
    if (key) localStorage.setItem(key, JSON.stringify(s));
  };

  const ownsVisibleState = Boolean(user?.id && loadedSubject === user.id);

  return (
    <AdminContext.Provider
      value={{
        sermons: ownsVisibleState ? sermons : [],
        addSermon,
        updateSermon,
        removeSermon,
        prayerRequests: ownsVisibleState ? prayerRequests : [],
        updatePrayerRequest,
        adminUsers,
        settings: ownsVisibleState ? settings : DEMO_CHURCH_SETTINGS,
        updateSettings,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
};
