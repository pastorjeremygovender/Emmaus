import React, { createContext, useContext, useEffect, useState } from 'react';
import { isDemoMode } from '../lib/firebase';
import { DEMO_USER, DEMO_ADMIN, DEMO_SUPER_ADMIN } from '../lib/demo-data';
import { DEMO_USER_2 } from '../lib/rooms-demo-data';

// ── API base URL ──────────────────────────────────────────────────────────────
function apiBase(): string {
  return (import.meta.env?.BASE_URL ?? '').replace(/\/$/, '');
}

// ── Session cookie bootstrap ──────────────────────────────────────────────────
// Issues a signed server-side session cookie for the given userId so that
// privileged API routes (admin/generator/companions) can verify identity via
// the cookie, removing the need to trust the X-User-Id header in production.
async function issueSessionCookie(userId: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    // Non-fatal in demo/dev: X-User-Id header fallback still works
  }
}

// ── Server profile helpers ────────────────────────────────────────────────────
// The user_profiles table stores the member's preferred name against their
// email address. This is the permanent source of truth — it survives
// localStorage clears, sign-out/sign-in cycles, and mobile OS cache eviction.

async function fetchServerProfile(email: string): Promise<{ preferredName: string } | null> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/users/profile?email=${encodeURIComponent(email.toLowerCase())}`,
      { credentials: 'include' }
    );
    if (!resp.ok) return null;
    return (await resp.json()) as { preferredName: string };
  } catch {
    return null;
  }
}

async function saveServerProfile(email: string, preferredName: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/users/profile`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase(), preferredName }),
    });
  } catch {
    // Non-fatal — localStorage is the fallback
  }
}

export type User = {
  id: string;
  email: string;
  preferredName: string;
  role: 'user' | 'admin' | 'superAdmin';
  currentFeeling?: string | null;
  feelingUpdatedAt?: string | null;
  streak?: number;
  completedJourneysCount?: number;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  /** True while the server profile (name) is being fetched on startup. Do not
   *  show the name-collection prompt or make routing decisions that depend on
   *  the name until this is false. */
  loadingProfile: boolean;
  isDemoMode: boolean;
  signIn: (email: string, pass: string) => Promise<'admin' | 'user' | 'superAdmin'>;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  signInDemo: (as?: boolean | 'superAdmin') => void;
  signOut: () => void;
  updateFeeling: (feeling: string) => void;
  /** Update the signed-in user's preferred display name and persist it to localStorage
   *  and the server. Returns a promise that resolves once the server save completes
   *  (or fails silently) so callers can await it before navigating away. */
  updateName: (name: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    // ── 1. Restore from localStorage (synchronous — sets loading = false) ──────
    const saved = localStorage.getItem('emmaus_demo_user');
    let localUser: User | null = null;

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as User;
        // Migrate legacy 'Friend' placeholder
        if (parsed?.preferredName === 'Friend') {
          parsed.preferredName = '';
          localStorage.setItem('emmaus_demo_user', JSON.stringify(parsed));
        }
        setUser(parsed);
        localUser = parsed;
        // Re-issue the session cookie so the signed emmaus_uid is fresh for this
        // session. Without this, a page refresh or app restart would rely on a
        // potentially-expired or browser-cleared cookie, breaking progress routes
        // in production where X-User-Id is not accepted.
        issueSessionCookie(parsed.id).catch(() => { /* non-fatal */ });
      } catch {
        // Corrupted session — clear it so the user can sign in fresh
        localStorage.removeItem('emmaus_demo_user');
      }
    }

    setLoading(false);

    // ── 2. Refresh from server (async — updates name if server has a better one) ──
    // This is the permanent source of truth. It corrects the name even if:
    //   a) sign-in previously overwrote it with the demo template (empty name)
    //   b) localStorage was partially cleared on mobile
    if (localUser?.email) {
      console.debug('[Emmaus auth] Profile load start — userId:', localUser.id);
      fetchServerProfile(localUser.email)
        .then(profile => {
          if (profile?.preferredName?.trim()) {
            console.debug('[Emmaus auth] Server name found:', profile.preferredName);
            setUser(prev => {
              if (!prev) return prev;
              const updated = { ...prev, preferredName: profile.preferredName };
              localStorage.setItem('emmaus_demo_user', JSON.stringify(updated));
              return updated;
            });
          } else {
            console.debug('[Emmaus auth] No saved name on server for this email');
          }
        })
        .catch(() => {
          console.debug('[Emmaus auth] Server profile fetch failed — using local name');
        })
        .finally(() => {
          console.debug('[Emmaus auth] Profile load complete');
          setLoadingProfile(false);
        });
    } else {
      // No email → no server profile to fetch
      setLoadingProfile(false);
    }
  }, []);

  const signIn = async (email: string, pass: string): Promise<'admin' | 'user' | 'superAdmin'> => {
    type DemoUser = typeof DEMO_USER | typeof DEMO_ADMIN | typeof DEMO_SUPER_ADMIN | typeof DEMO_USER_2;
    let u: DemoUser = DEMO_USER;
    let role: 'admin' | 'user' | 'superAdmin' = 'user';
    if (email === 'superadmin@emmaus.church' && pass === 'admin123') {
      u = DEMO_SUPER_ADMIN; role = 'superAdmin';
    } else if ((email === 'admin@emmaus.demo' || email === 'pastor@emmaus.church') && pass === 'admin123') {
      u = DEMO_ADMIN; role = 'admin';
    } else if (email === 'friend@emmaus.church') {
      u = DEMO_USER_2;
    }

    // Build the resolved user, always stamping the actual email they signed in with
    let resolvedUser: User = { ...(u as User), email };

    if (role === 'user') {
      // ── Step A: Preserve existing name from localStorage ─────────────────────
      // signIn was previously overwriting the whole user object with the demo
      // template (empty name). We now check whether a prior session stored a
      // name in localStorage and carry it forward to avoid losing it.
      const existingSaved = localStorage.getItem('emmaus_demo_user');
      if (existingSaved) {
        try {
          const existing = JSON.parse(existingSaved) as User;
          if (existing?.preferredName?.trim()) {
            resolvedUser = { ...resolvedUser, preferredName: existing.preferredName };
            console.debug('[Emmaus auth] Preserved name from localStorage:', existing.preferredName);
          }
        } catch { /* ignore */ }
      }
    }

    // Issue the session cookie before fetching the server profile
    await issueSessionCookie(resolvedUser.id);
    console.debug('[Emmaus auth] Sign-in userId:', resolvedUser.id, 'role:', role);

    if (role === 'user' && !resolvedUser.preferredName?.trim()) {
      // ── Step B: Check server for a permanently saved name ─────────────────────
      // If localStorage was cleared (e.g. mobile OS eviction) AND the cookie was
      // also lost (or we got a fresh template), check whether the server has this
      // member's name under their email address.
      console.debug('[Emmaus auth] No name in localStorage — checking server for:', email);
      const profile = await fetchServerProfile(email);
      if (profile?.preferredName?.trim()) {
        resolvedUser = { ...resolvedUser, preferredName: profile.preferredName };
        console.debug('[Emmaus auth] Restored name from server:', profile.preferredName);
      }
    }

    setUser(resolvedUser);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(resolvedUser));
    return role;
  };

  const signUp = async (email: string, pass: string, name: string) => {
    const newUser: User = { ...DEMO_USER, email, preferredName: name, id: 'demo-' + Date.now() };
    setUser(newUser);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(newUser));
    await issueSessionCookie(newUser.id);
    // Save the name to the server and AWAIT it so the profile is persisted
    // before signUp resolves.  Auth.tsx navigates immediately after awaiting
    // signUp, so the server record exists before the user leaves onboarding.
    if (name.trim()) {
      await saveServerProfile(email, name.trim());
    }
  };

  const signInDemo = async (as: boolean | 'superAdmin' = false) => {
    const u = as === 'superAdmin' ? DEMO_SUPER_ADMIN : as ? DEMO_ADMIN : DEMO_USER;
    setUser(u);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(u));
    // Establish server-side signed cookie so admin API routes work in production
    await issueSessionCookie(u.id);
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('emmaus_demo_user');
  };

  const updateFeeling = (feeling: string) => {
    if (!user) return;
    const updated = { ...user, currentFeeling: feeling, feelingUpdatedAt: new Date().toISOString() };
    setUser(updated);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(updated));
  };

  const updateName = async (name: string): Promise<void> => {
    if (!user) return;
    const trimmed = name.trim();
    const updated = { ...user, preferredName: trimmed };
    setUser(updated);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(updated));
    // Persist to server and AWAIT it — this is what survives localStorage
    // eviction.  Previously this was fire-and-forget, which meant a network
    // failure or immediate navigation could leave the server with no record
    // and the name would be lost the next time localStorage was cleared.
    if (user.email && trimmed) {
      console.debug('[Emmaus auth] Saving name to server:', trimmed);
      await saveServerProfile(user.email, trimmed);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loadingProfile,
        isDemoMode,
        signIn,
        signUp,
        signInDemo,
        signOut,
        updateFeeling,
        updateName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
