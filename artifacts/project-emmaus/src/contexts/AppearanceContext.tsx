import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { accountStorageKey } from '@/lib/account-storage';
import { getApiUrl } from '@/lib/api';

export type AppearanceTheme = 'light' | 'dark';
export type AppearanceFontSize = 'standard' | 'large' | 'extra-large';

type AppearancePreferences = {
  theme: AppearanceTheme;
  fontSize: AppearanceFontSize;
};

type AppearanceContextValue = AppearancePreferences & {
  setTheme: (theme: AppearanceTheme) => void;
  setFontSize: (fontSize: AppearanceFontSize) => void;
};

const DEFAULT_PREFERENCES: AppearancePreferences = {
  theme: 'light',
  fontSize: 'standard',
};
const LAST_APPEARANCE_KEY = 'emmaus_last_appearance_preferences';

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function loadPreferences(subject: string): AppearancePreferences {
  try {
    const raw = localStorage.getItem(accountStorageKey('appearance_preferences', subject));
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppearancePreferences>;
    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      fontSize:
        parsed.fontSize === 'large' || parsed.fontSize === 'extra-large'
          ? parsed.fontSize
          : 'standard',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function applyPreferences(preferences: AppearancePreferences) {
  const root = document.documentElement;
  root.classList.toggle('dark', preferences.theme === 'dark');
  root.dataset.fontSize = preferences.fontSize;
  root.style.colorScheme = preferences.theme;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [preferences, setPreferences] = useState<AppearancePreferences>(DEFAULT_PREFERENCES);
  const loadSequence = useRef(0);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    if (loading) return;
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      return;
    }

    const local = loadPreferences(user.id);
    setPreferences(local);

    const pendingKey = accountStorageKey('appearance_preferences_pending', user.id);
    const hasPendingLocalChange = localStorage.getItem(pendingKey) === 'true';

    const synchronizeLocal = () => {
      fetch(getApiUrl('/api/users/appearance'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local),
      })
        .then(response => {
          if (response.ok) localStorage.removeItem(pendingKey);
        })
        .catch(() => {});
    };

    if (hasPendingLocalChange) {
      synchronizeLocal();
      return;
    }

    fetch(getApiUrl('/api/users/appearance'), {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('unavailable')))
      .then((remote: Partial<AppearancePreferences>) => {
        if (sequence !== loadSequence.current) return;
        const next: AppearancePreferences = {
          theme: remote.theme === 'dark' ? 'dark' : 'light',
          fontSize:
            remote.fontSize === 'large' || remote.fontSize === 'extra-large'
              ? remote.fontSize
              : 'standard',
        };
        setPreferences(next);
        localStorage.setItem(accountStorageKey('appearance_preferences', user.id), JSON.stringify(next));
        localStorage.setItem(LAST_APPEARANCE_KEY, JSON.stringify(next));
      })
      .catch(() => {
        // The account value can be synchronized by the next successful update/load.
      });
  }, [loading, user?.id]);

  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  const updatePreferences = useCallback((next: Partial<AppearancePreferences>) => {
    setPreferences(current => {
      const updated = { ...current, ...next };
      if (user) {
        try {
          localStorage.setItem(
            accountStorageKey('appearance_preferences', user.id),
            JSON.stringify(updated),
          );
          localStorage.setItem(LAST_APPEARANCE_KEY, JSON.stringify(updated));
        } catch {
          // Preferences still apply for this session if storage is unavailable.
        }
      }
      if (user) {
        const pendingKey = accountStorageKey('appearance_preferences_pending', user.id);
        try {
          localStorage.setItem(pendingKey, 'true');
        } catch {
          // The visible preference still applies for this session.
        }
        fetch(getApiUrl('/api/users/appearance'), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
          .then(response => {
            if (response.ok) localStorage.removeItem(pendingKey);
          })
          .catch(() => {
            // Local state is authoritative until a later load/update can synchronize.
          });
      }
      return updated;
    });
  }, [user]);

  const value = useMemo<AppearanceContextValue>(() => ({
    ...preferences,
    setTheme: theme => updatePreferences({ theme }),
    setFontSize: fontSize => updatePreferences({ fontSize }),
  }), [preferences, updatePreferences]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used within AppearanceProvider');
  return context;
}