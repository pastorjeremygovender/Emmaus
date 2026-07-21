import React, { createContext, useContext, useEffect, useState } from 'react';
import { isDemoMode } from '../lib/firebase';
import { DEMO_USER, DEMO_ADMIN } from '../lib/demo-data';

export type User = {
  id: string;
  email: string;
  preferredName: string;
  role: 'user' | 'admin';
  currentFeeling?: string | null;
  feelingUpdatedAt?: string | null;
  streak?: number;
  completedJourneysCount?: number;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, pass: string) => Promise<'admin' | 'user'>;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  signInDemo: (asAdmin?: boolean) => void;
  signOut: () => void;
  updateFeeling: (feeling: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for demo session
    const saved = localStorage.getItem('emmaus_demo_user');
    if (saved) {
      setUser(JSON.parse(saved));
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, pass: string): Promise<'admin' | 'user'> => {
    // Demo only for now — exact match for the demo admin account
    if (email === 'admin@emmaus.demo' && pass === 'admin123') {
      setUser(DEMO_ADMIN);
      localStorage.setItem('emmaus_demo_user', JSON.stringify(DEMO_ADMIN));
      return 'admin';
    } else {
      setUser(DEMO_USER);
      localStorage.setItem('emmaus_demo_user', JSON.stringify(DEMO_USER));
      return 'user';
    }
  };

  const signUp = async (email: string, pass: string, name: string) => {
    const newUser: User = { ...DEMO_USER, email, preferredName: name, id: 'demo-' + Date.now() };
    setUser(newUser);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(newUser));
  };

  const signInDemo = (asAdmin = false) => {
    const u = asAdmin ? DEMO_ADMIN : DEMO_USER;
    setUser(u);
    localStorage.setItem('emmaus_demo_user', JSON.stringify(u));
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
        updateFeeling
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
