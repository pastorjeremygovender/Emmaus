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
  code?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
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

export function getSupabaseErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const error = payload as SupabaseErrorPayload;
  if (typeof error.error_code === "string") return error.error_code;
  if (typeof error.code === "string") return error.code;
  if (typeof error.error === "string") return error.error;
  return undefined;
}

async function callSupabase<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
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
      // ReplitConnectors.proxy retries every 401 as a connector-auth failure.
      // Supabase uses 401 for password failures in some environments, so that
      // retry can discard the original GoTrue response and its error code.
      // Use the SDK's lower-level primitives for a single provider request.
      const proxyPath = path.startsWith("/") ? path : `/${path}`;
      const headers = {
        ...(await connectors.getProxyHeaders(SUPABASE_CONNECTOR)),
        ...(options.body == null ? {} : { "content-type": "application/json" }),
        ...options.headers,
      };
      response = await fetch(`${connectors.getProxyUrl()}${proxyPath}`, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body == null
            ? undefined
            : typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body),
      });
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
      error?.message ??
        error?.msg ??
        error?.error_description ??
        error?.error ??
        "Account request failed.",
      getSupabaseErrorCode(error),
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

export async function resendConfirmationEmail(input: {
  email: string;
  redirectTo: string;
}): Promise<void> {
  await callSupabase("/auth/v1/resend", {
    method: "POST",
    body: {
      type: "signup",
      email: input.email,
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
  userId: string;
  password: string;
}): Promise<void> {
  await callSupabase(`/auth/v1/admin/users/${encodeURIComponent(input.userId)}`, {
    method: "PUT",
    body: { password: input.password },
  });
}

/**
 * Keep the identity-provider account locked as a defence in depth measure.
 * Emmaus also enforces this server-side, so a provider outage never restores
 * access to an account removed from the application.
 */
export async function suspendSupabaseUser(userId: string): Promise<void> {
  await callSupabase(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: { ban_duration: "876000h" },
  });
}

export async function reinstateSupabaseUser(userId: string): Promise<void> {
  await callSupabase(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: { ban_duration: "none" },
  });
}

export async function deleteSupabaseUser(
  userId: string,
  options: { ignoreNotFound?: boolean } = {},
): Promise<void> {
  try {
    await callSupabase(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    // This is safe only after the caller has established a durable local
    // permanent-deletion tombstone. A repeated provider delete may return 404
    // when the first delete succeeded but its response was lost.
    if (
      options.ignoreNotFound &&
      error instanceof SupabaseAuthError &&
      error.status === 404
    ) {
      return;
    }
    throw error;
  }
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