import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { isDemoMode as firebaseDemoMode } from "../lib/firebase";
import { getApiBase, getApiUrl } from "../lib/api";

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
  signIn: () => void;
  signOut: () => void;
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

function getAppRoot(): string {
  const base = getApiBase();
  return `${base || ""}/`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // A localStorage user object is never an authentication authority.
    localStorage.removeItem("emmaus_demo_user");

    fetch(getApiUrl("/api/auth/user"), {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { user: ServerAuthUser | null };
      })
      .then(({ user: serverUser }) => {
        if (cancelled || !serverUser) return;
        const localState = loadMemberState(serverUser.id);
        setUser({
          id: serverUser.id,
          email: serverUser.email ?? "",
          preferredName:
            serverUser.preferredName || serverUser.firstName || "",
          role: serverUser.role,
          ...localState,
        });
      })
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
  }, []);

  const signIn = useCallback(() => {
    const returnTo = getAppRoot();
    window.location.assign(
      `${getApiUrl("/api/login")}?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("emmaus_demo_user");
    const returnTo = getAppRoot();
    const form = document.createElement("form");
    form.method = "POST";
    form.action =
      `${getApiUrl("/api/logout")}?returnTo=${encodeURIComponent(returnTo)}`;
    form.hidden = true;
    document.body.appendChild(form);
    form.submit();
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
        isDemoMode: import.meta.env.DEV && firebaseDemoMode,
        signIn,
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