import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getApiUrl } from "../lib/api";
import {
  clearSessionAccountState,
  retireUnownedPersonalStorage,
  SESSION_SUBJECT_KEY,
} from "../lib/account-storage";

export type User = {
  id: string;
  email: string;
  preferredName: string;
  role: "user" | "admin" | "superAdmin";
  passwordRecovery?: boolean;
  currentFeeling?: string | null;
  feelingUpdatedAt?: string | null;
  streak?: number;
  completedJourneysCount?: number;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  loadingProfile: boolean;
  sessionEpoch: number;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateFeeling: (feeling: string) => void;
  updateName: (name: string) => Promise<void>;
};

type ServerAuthUser = {
  id: string;
  email: string | null;
  preferredName: string;
  role: User["role"];
  firstName?: string | null;
};

type LocalMemberState = Pick<
  User,
  "currentFeeling" | "feelingUpdatedAt" | "streak" | "completedJourneysCount"
>;

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_SYNC_KEY = "emmaus_auth_sync";

function memberStateKey(userId: string): string {
  return `emmaus_member_state:${userId}`;
}

function loadMemberState(userId: string): LocalMemberState {
  try {
    const raw = localStorage.getItem(memberStateKey(userId));
    return raw ? (JSON.parse(raw) as LocalMemberState) : {};
  } catch {
    return {};
  }
}

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return body?.error ?? "We could not complete that account request.";
}

function broadcastAuthChange(): void {
  try {
    localStorage.setItem(
      AUTH_SYNC_KEY,
      JSON.stringify({ changedAt: Date.now(), nonce: Math.random().toString(36).slice(2) }),
    );
  } catch {
    // Cross-tab sync falls back to focus/visibility revalidation.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const lastSubjectRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const authMutationRef = useRef(false);

  const invalidateAuthView = useCallback(() => {
    requestGenerationRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setSessionEpoch(current => current + 1);
    setUser(null);
    setLoading(true);
    setLoadingProfile(true);
  }, []);

  const refreshAuthenticatedUser = useCallback(async (
    options: { preserveUi?: boolean } = {},
  ): Promise<void> => {
    const preserveUi = options.preserveUi === true;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    if (!preserveUi) {
      setSessionEpoch(current => current + 1);
      setUser(null);
      setLoading(true);
      setLoadingProfile(true);
    }

    try {
      const response = await fetch(getApiUrl("/api/auth/user"), {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { user: serverUser, passwordRecovery = false } = (await response.json()) as {
        user: ServerAuthUser | null;
        passwordRecovery?: boolean;
      };
      if (requestGenerationRef.current !== generation) return;

      const rememberedSubject =
        lastSubjectRef.current ?? sessionStorage.getItem(SESSION_SUBJECT_KEY);
      if (!serverUser) {
        if (rememberedSubject) {
          clearSessionAccountState();
          broadcastAuthChange();
        }
        lastSubjectRef.current = null;
        setUser(null);
        return;
      }

      if (rememberedSubject && rememberedSubject !== serverUser.id) {
        clearSessionAccountState();
        broadcastAuthChange();
      }
      lastSubjectRef.current = serverUser.id;
      sessionStorage.setItem(SESSION_SUBJECT_KEY, serverUser.id);
      const localState = loadMemberState(serverUser.id);
      setUser({
        id: serverUser.id,
        email: serverUser.email ?? "",
        preferredName: serverUser.preferredName || serverUser.firstName || "",
        role: serverUser.role,
        passwordRecovery,
        ...localState,
      });
    } catch (error) {
      if (
        requestGenerationRef.current !== generation ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      if (!preserveUi) setUser(null);
      throw error;
    } finally {
      if (requestGenerationRef.current === generation) {
        activeRequestRef.current = null;
        if (!preserveUi) {
          setLoading(false);
          setLoadingProfile(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    // A localStorage user object is never an authentication authority.
    localStorage.removeItem("emmaus_demo_user");
    retireUnownedPersonalStorage();

    const revalidate = (preserveUi = false) => {
      if (authMutationRef.current) {
        invalidateAuthView();
        return;
      }
      void refreshAuthenticatedUser({ preserveUi }).catch(() => {
        // The accepted validation request already moved the UI to signed out.
      });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_KEY && event.newValue) revalidate(false);
    };
    const handleFocus = () => revalidate(true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") revalidate(true);
    };

    revalidate();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      requestGenerationRef.current += 1;
      activeRequestRef.current?.abort();
    };
  }, [invalidateAuthView, refreshAuthenticatedUser]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      authMutationRef.current = true;
      invalidateAuthView();
      try {
        const response = await fetch(getApiUrl("/api/auth/login"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) throw new Error(await readApiError(response));
        broadcastAuthChange();
        await refreshAuthenticatedUser();
      } catch (error) {
        await refreshAuthenticatedUser().catch(() => {});
        throw error;
      } finally {
        authMutationRef.current = false;
      }
    },
    [invalidateAuthView, refreshAuthenticatedUser],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<void> => {
      const response = await fetch(getApiUrl("/api/auth/signup"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
    },
    [],
  );

  const sendPasswordReset = useCallback(async (email: string): Promise<void> => {
    const response = await fetch(getApiUrl("/api/auth/recover"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
  }, []);

  const resetPassword = useCallback(
    async (password: string): Promise<void> => {
      authMutationRef.current = true;
      invalidateAuthView();
      try {
        const response = await fetch(getApiUrl("/api/auth/password"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!response.ok) throw new Error(await readApiError(response));
        await refreshAuthenticatedUser();
      } catch (error) {
        await refreshAuthenticatedUser().catch(() => {});
        throw error;
      } finally {
        authMutationRef.current = false;
      }
    },
    [invalidateAuthView, refreshAuthenticatedUser],
  );

  const signOut = useCallback(async (): Promise<void> => {
    authMutationRef.current = true;
    invalidateAuthView();
    localStorage.removeItem("emmaus_demo_user");
    try {
      const response = await fetch(getApiUrl("/api/logout"), {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readApiError(response));
      lastSubjectRef.current = null;
      localStorage.removeItem("emmaus_dev_mode");
      localStorage.removeItem("emmaus_admin_session");
      clearSessionAccountState();
      broadcastAuthChange();
      setLoading(false);
      setLoadingProfile(false);
    } catch (error) {
      await refreshAuthenticatedUser().catch(() => {});
      throw error;
    } finally {
      authMutationRef.current = false;
    }
  }, [invalidateAuthView, refreshAuthenticatedUser]);

  const updateFeeling = useCallback(
    (feeling: string) => {
      if (!user) return;
      const updated: User = {
        ...user,
        currentFeeling: feeling,
        feelingUpdatedAt: new Date().toISOString(),
      };
      setUser(updated);
      localStorage.setItem(
        memberStateKey(user.id),
        JSON.stringify({
          currentFeeling: updated.currentFeeling,
          feelingUpdatedAt: updated.feelingUpdatedAt,
          streak: updated.streak,
          completedJourneysCount: updated.completedJourneysCount,
        } satisfies LocalMemberState),
      );
    },
    [user],
  );

  const updateName = useCallback(
    async (name: string): Promise<void> => {
      if (!user) return;
      const preferredName = name.trim();
      if (!preferredName) return;
      const subject = user.id;

      const response = await fetch(getApiUrl("/api/users/profile"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredName }),
      });
      if (!response.ok) {
        throw new Error("We could not save your preferred name.");
      }
      setUser((current) =>
        current?.id === subject ? { ...current, preferredName } : current,
      );
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loadingProfile,
        sessionEpoch,
        isDemoMode: false,
        signIn,
        signUp,
        sendPasswordReset,
        resetPassword,
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
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};