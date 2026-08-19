import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getApiUrl } from "../lib/api";

export type User = {
  id: string;
  email: string;
  preferredName: string;
  role: "user" | "admin" | "superAdmin";
  currentFeeling?: string | null;
  feelingUpdatedAt?: string | null;
  streak?: number;
  completedJourneysCount?: number;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  loadingProfile: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  completeAuthSession: (
    accessToken: string,
    refreshToken?: string,
  ) => Promise<void>;
  resetPassword: (
    accessToken: string,
    refreshToken: string | undefined,
    password: string,
  ) => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const refreshAuthenticatedUser = useCallback(async (): Promise<void> => {
    const response = await fetch(getApiUrl("/api/auth/user"), {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { user: serverUser } = (await response.json()) as {
      user: ServerAuthUser | null;
    };
    if (!serverUser) {
      setUser(null);
      return;
    }
    const localState = loadMemberState(serverUser.id);
    setUser({
      id: serverUser.id,
      email: serverUser.email ?? "",
      preferredName: serverUser.preferredName || serverUser.firstName || "",
      role: serverUser.role,
      ...localState,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // A localStorage user object is never an authentication authority.
    localStorage.removeItem("emmaus_demo_user");

    refreshAuthenticatedUser()
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshAuthenticatedUser]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const response = await fetch(getApiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      await refreshAuthenticatedUser();
    },
    [refreshAuthenticatedUser],
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

  const completeAuthSession = useCallback(
    async (accessToken: string, refreshToken?: string): Promise<void> => {
      const response = await fetch(getApiUrl("/api/auth/complete"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, refreshToken }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      await refreshAuthenticatedUser();
    },
    [refreshAuthenticatedUser],
  );

  const resetPassword = useCallback(
    async (
      accessToken: string,
      refreshToken: string | undefined,
      password: string,
    ): Promise<void> => {
      const response = await fetch(getApiUrl("/api/auth/password"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      await completeAuthSession(accessToken, refreshToken);
    },
    [completeAuthSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    localStorage.removeItem("emmaus_demo_user");
    const response = await fetch(getApiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error(await readApiError(response));
    setUser(null);
  }, []);

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
        current ? { ...current, preferredName } : current,
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
        isDemoMode: false,
        signIn,
        signUp,
        sendPasswordReset,
        completeAuthSession,
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