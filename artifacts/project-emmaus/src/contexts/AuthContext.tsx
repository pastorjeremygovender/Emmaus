import React, { createContext, useContext, useEffect, useState } from 'react';
import { isDemoMode } from '../lib/firebase';
import { DEMO_USER, DEMO_ADMIN, DEMO_SUPER_ADMIN } from '../lib/demo-data';
import { DEMO_USER_2 } from '../lib/rooms-demo-data';

// ── Session cookie bootstrap ──────────────────────────────────────────────────
// Issues a signed server-side session cookie for the given userId so that
// privileged API routes (admin/generator/companions) can verify identity via
// the cookie, removing the need to trust the X-User-Id header in production.
async function issueSessionCookie(userId: string): Promise<void> {
  try {
    const base = (import.meta.env?.BASE_URL ?? '').replace(/\/$/, '');
    await fetch(`${base}/api/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    // Non-fatal in demo/dev: X-User-Id header fallback still works
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
  isDemoMode: boolean;
  signIn: (email: string, pass: string) => Promise<'admin' | 'user' | 'superAdmin'>;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  signInDemo: (as?: boolean | 'superAdmin') => void;
  signOut: () => void;
  updateFeeling: (feeling: string) => void;
  /** Update the signed-in user's preferred display name and persist it. */
  updateName: (name: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for demo session
    const saved = localStorage.getItem('emmaus_demo_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as User;
        // Migrate legacy 'Friend' placeholder — normalise to empty string so
        // the name-collection prompt appears on next onboarding visit.
        if (parsed?.preferredName === 'Friend') {
          parsed.preferredName = '';
          localStorage.setItem('emmaus_demo_user', JSON.stringify(parsed));
        }
        setUser(parsed);
      } catch {
        // Corrupted session — clear it so the user can sign in fresh
        localStorage.removeItem('emmaus_demo_user');
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, pass: string): Promise<'admin' | 'user' | 'superAdmin'> => {
    // Demo only — exact match for known demo accounts
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
    setUser(u as User);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(u));
    // Establish server-side signed cookie so admin API routes work in production
    await issueSessionCookie(u.id);
    return role;
  };

  const signUp = async (email: string, pass: string, name: string) => {
    const newUser: User = { ...DEMO_USER, email, preferredName: name, id: 'demo-' + Date.now() };
    setUser(newUser);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(newUser));
    await issueSessionCookie(newUser.id);
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

  const updateName = (name: string) => {
    if (!user) return;
    const trimmed = name.trim();
    const updated = { ...user, preferredName: trimmed };
    setUser(updated);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
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
