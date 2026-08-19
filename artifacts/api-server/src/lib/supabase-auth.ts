import { ReplitConnectors } from "@replit/connectors-sdk";

const SUPABASE_CONNECTOR = "supabase";
const connectors = new ReplitConnectors();

export type SupabaseUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user?: SupabaseUser;
};

type SupabaseErrorPayload = {
  error?: string;
  error_code?: string;
  msg?: string;
  message?: string;
};

export class SupabaseAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

async function callSupabase<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    const testBaseUrl =
      process.env.NODE_ENV === "test"
        ? process.env.SUPABASE_AUTH_TEST_URL
        : undefined;
    if (testBaseUrl) {
      response = await fetch(new URL(path, testBaseUrl), {
        method: options.method,
        headers: {
          ...(options.body == null ? {} : { "content-type": "application/json" }),
          ...options.headers,
        },
        body: options.body == null ? undefined : JSON.stringify(options.body),
      });
    } else {
      response = await connectors.proxy(SUPABASE_CONNECTOR, path, options);
    }
  } catch {
    throw new SupabaseAuthError(
      503,
      "The account service is temporarily unavailable.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | T
    | SupabaseErrorPayload
    | null;
  if (!response.ok) {
    const error = payload as SupabaseErrorPayload | null;
    throw new SupabaseAuthError(
      response.status,
      error?.message ?? error?.msg ?? error?.error ?? "Account request failed.",
      error?.error_code,
    );
  }
  return payload as T;
}

function bearer(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function signUpWithPassword(input: {
  email: string;
  password: string;
  redirectTo: string;
}): Promise<void> {
  await callSupabase<SupabaseSession>("/auth/v1/signup", {
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
      data: {},
      gotrue_meta_security: {},
      redirect_to: input.redirectTo,
    },
  });
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<SupabaseSession> {
  return callSupabase<SupabaseSession>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: input.email, password: input.password },
  });
}

export async function refreshSupabaseSession(
  refreshToken: string,
): Promise<SupabaseSession> {
  return callSupabase<SupabaseSession>(
    "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      body: { refresh_token: refreshToken },
    },
  );
}

export async function verifySupabaseOtp(input: {
  tokenHash: string;
  type: "email" | "recovery";
}): Promise<SupabaseSession> {
  return callSupabase<SupabaseSession>("/auth/v1/verify", {
    method: "POST",
    body: {
      token_hash: input.tokenHash,
      type: input.type,
    },
  });
}

export async function getVerifiedSupabaseUser(
  accessToken: string,
): Promise<SupabaseUser> {
  const user = await callSupabase<SupabaseUser>("/auth/v1/user", {
    headers: bearer(accessToken),
  });
  if (
    !user.id ||
    !user.email ||
    !(user.email_confirmed_at || user.confirmed_at)
  ) {
    throw new SupabaseAuthError(
      403,
      "Please verify your email address before signing in.",
    );
  }
  return user;
}

export async function sendPasswordRecoveryEmail(input: {
  email: string;
  redirectTo: string;
}): Promise<void> {
  await callSupabase("/auth/v1/recover", {
    method: "POST",
    body: {
      email: input.email,
      gotrue_meta_security: {},
      redirect_to: input.redirectTo,
    },
  });
}

export async function updateSupabasePassword(input: {
  accessToken: string;
  password: string;
}): Promise<void> {
  await callSupabase("/auth/v1/user", {
    method: "PUT",
    headers: bearer(input.accessToken),
    body: { password: input.password },
  });
}

export async function revokeSupabaseSession(
  accessToken: string,
): Promise<void> {
  await callSupabase("/auth/v1/logout", {
    method: "POST",
    headers: bearer(accessToken),
    body: { scope: "local" },
  });
}