import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { accountStorageKey } from '@/lib/account-storage';

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

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<AppearancePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPreferences(user ? loadPreferences(user.id) : DEFAULT_PREFERENCES);
  }, [user?.id]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', preferences.theme === 'dark');
    root.dataset.fontSize = preferences.fontSize;
    root.style.colorScheme = preferences.theme;
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
        } catch {
          // Preferences still apply for this session if storage is unavailable.
        }
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