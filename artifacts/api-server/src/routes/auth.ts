import {
  authBootstrapStateTable,
  db,
  permanentlyDeletedAccountsTable,
  userProfilesTable,
  usersTable,
  type UserRole,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  clearSession,
  consumePasswordRecoveryAuthorization,
  createSession,
  getSession,
  getSessionId,
  PASSWORD_RECOVERY_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  type SessionData,
} from "../lib/oidc-auth.js";
import { getCanonicalPublicOrigin } from "../lib/public-origin.js";
import {
  revokeSupabaseSession,
  resendConfirmationEmail,
  sendPasswordRecoveryEmail,
  signInWithPassword,
  signUpWithPassword,
  SupabaseAuthError,
  type SupabaseSession,
  type SupabaseUser,
  updateSupabasePassword,
  verifySupabaseOtp,
} from "../lib/supabase-auth.js";
import { isPermanentlyDeletedAccount } from "../lib/account-lifecycle-store.js";
import { logger } from "../lib/logger.js";

export const authRouter = Router();

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
}

function claimString(
  claims: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function readPassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.length >= 8 && value.length <= 128 ? value : null;
}

function readSafeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300 || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\n") || value.includes("\r")) return null;
  return /^\/(?:groups\/join|join-room)\/[A-Za-z0-9_-]{8,160}$/.test(value)
    ? value
    : null;
}

function getAuthRedirectUrl(returnTo?: string | null): string {
  const url = new URL(`${getCanonicalPublicOrigin()}/api/auth/callback`);
  const safe = readSafeReturnTo(returnTo);
  if (safe) url.searchParams.set("returnTo", safe);
  return url.toString();
}

function getRecoveryPageUrl(returnTo?: string | null): string {
  const url = new URL(`${getCanonicalPublicOrigin()}/auth/callback`);
  url.searchParams.set("mode", "recovery");
  const safe = readSafeReturnTo(returnTo);
  if (safe) url.searchParams.set("returnTo", safe);
  return url.toString();
}

class IdentityConflictError extends Error {
  constructor() {
    super("This verified email is already bound to another identity.");
    this.name = "IdentityConflictError";
  }
}

class LegacyProfileMigrationRequiredError extends Error {
  constructor() {
    super(
      "This Emmaus profile needs a secure account migration before it can be used with email and password.",
    );
    this.name = "LegacyProfileMigrationRequiredError";
  }
}

class RemovedAccountError extends Error {
  constructor() {
    super("This Emmaus account has been removed. Please contact your administrator.");
    this.name = "RemovedAccountError";
  }
}

class PermanentlyDeletedAccountError extends Error {
  constructor() {
    super("This Emmaus account was permanently deleted. Please contact your administrator.");
    this.name = "PermanentlyDeletedAccountError";
  }
}

function isConfiguredInitialOwner(email: string): boolean {
  return (
    process.env.EMMAUS_INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase() === email
  );
}

/**
 * Do not let an email-only profile silently enter a new identity. Without a
 * reviewed link to the legacy owner ID, the new account would correctly see an
 * empty private progress area and make existing data appear lost.
 */
/** @internal Exported only for focused identity-safety tests. */
export async function requireMigratedProfileForEmail(
  email: string,
): Promise<void> {
  if (isConfiguredInitialOwner(email)) return;
  const [profile] = await db
    .select({ authSubject: userProfilesTable.authSubject })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.email, email));
  if (profile && !profile.authSubject) {
    throw new LegacyProfileMigrationRequiredError();
  }
}

function supabaseClaims(user: SupabaseUser): Record<string, unknown> {
  const metadata = user.user_metadata ?? {};
  return {
    sub: user.id,
    email: user.email,
    email_verified: Boolean(user.email_confirmed_at || user.confirmed_at),
    first_name: claimString(metadata, "first_name", "given_name"),
    last_name: claimString(metadata, "last_name", "family_name"),
    picture: claimString(metadata, "avatar_url", "picture"),
  };
}

/** @internal Exported only for focused unit tests — not a runtime endpoint. */
export async function upsertVerifiedIdentity(claims: Record<string, unknown>) {
  const subject = claimString(claims, "sub");
  if (!subject) throw new Error("Verified identity did not contain a subject");

  const emailVerified = claims.email_verified === true;
  const claimedEmail = claimString(claims, "email")?.toLowerCase() ?? null;
  const verifiedEmail = emailVerified ? claimedEmail : null;
  const firstName = claimString(claims, "first_name", "given_name");
  const lastName = claimString(claims, "last_name", "family_name");
  const profileImageUrl = claimString(claims, "profile_image_url", "picture");

  if (!verifiedEmail) {
    throw new Error("The identity provider did not return a verified email");
  }
  const isInitialOwner = isConfiguredInitialOwner(verifiedEmail);

  return db.transaction(async (tx) => {
    // Share the exact subject lock used by permanent deletion. The tombstone
    // check must happen inside this transaction before any identity upsert,
    // otherwise a login can recreate a profile just after it was purged.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${subject}))`,
    );
    const [tombstone] = await tx
      .select({ accountId: permanentlyDeletedAccountsTable.accountId })
      .from(permanentlyDeletedAccountsTable)
      .where(eq(permanentlyDeletedAccountsTable.accountId, subject));
    if (tombstone) {
      throw new PermanentlyDeletedAccountError();
    }

    const [emailOwner] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, verifiedEmail));
    if (emailOwner && emailOwner.id !== subject) {
      throw new IdentityConflictError();
    }

    const [user] = await tx
      .insert(usersTable)
      .values({
        id: subject,
        email: verifiedEmail,
        firstName,
        lastName,
        profileImageUrl,
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          email: verifiedEmail,
          firstName,
          lastName,
          profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    const bootstrapKey = "initial-superadmin";
    let initialOwnerClaimed = false;
    if (isInitialOwner) {
      const [bootstrapState] = await tx
        .select()
        .from(authBootstrapStateTable)
        .where(eq(authBootstrapStateTable.key, bootstrapKey));

      if (!bootstrapState) {
        const [existingSuperAdmin] = await tx
          .select({ authSubject: userProfilesTable.authSubject })
          .from(userProfilesTable)
          .where(eq(userProfilesTable.appRole, "superAdmin"))
          .limit(1);

        if (existingSuperAdmin?.authSubject) {
          await tx
            .insert(authBootstrapStateTable)
            .values({
              key: bootstrapKey,
              claimedBy: existingSuperAdmin.authSubject,
            })
            .onConflictDoNothing();
        } else {
          const [claim] = await tx
            .insert(authBootstrapStateTable)
            .values({ key: bootstrapKey, claimedBy: subject })
            .onConflictDoNothing()
            .returning();
          initialOwnerClaimed = Boolean(claim);
        }
      }
    }

    let [profile] = await tx
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.authSubject, subject));

    if (!profile) {
      const [emailProfile] = await tx
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.email, verifiedEmail));

      if (emailProfile?.authSubject && emailProfile.authSubject !== subject) {
        throw new IdentityConflictError();
      }

      if (emailProfile && !initialOwnerClaimed) {
        // An email-only record may belong to an unverified legacy identity.
        // Only the atomically claimed initial owner may bind one.
        throw new IdentityConflictError();
      }
      if (emailProfile) {
        // This exact verified mailbox has atomically claimed the one-time owner
        // bootstrap state in this transaction.
        [profile] = await tx
          .update(userProfilesTable)
          .set({ authSubject: subject, updatedAt: new Date() })
          .where(eq(userProfilesTable.email, verifiedEmail))
          .returning();
      } else {
        [profile] = await tx
          .insert(userProfilesTable)
          .values({
            email: verifiedEmail,
            authSubject: subject,
            preferredName: firstName ?? "",
          })
          .returning();
      }
    } else {
      // Repeated sign-ins refresh the same subject-bound profile; they never
      // create a second profile row for an existing verified subject.
      [profile] = await tx
        .update(userProfilesTable)
        .set({
          preferredName: profile.preferredName || firstName || "",
          updatedAt: new Date(),
        })
        .where(eq(userProfilesTable.authSubject, subject))
        .returning();
    }

    if (initialOwnerClaimed) {
      [profile] = await tx
        .update(userProfilesTable)
        .set({
          appRole: "superAdmin" satisfies UserRole,
          roleAssignedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userProfilesTable.authSubject, subject))
        .returning();
    }

    return { user, profile };
  });
}

async function establishSession(
  req: Request,
  res: Response,
  session: SupabaseSession,
  options: { passwordRecovery?: boolean } = {},
): Promise<void> {
  if (!session.access_token) {
    throw new Error("The account service did not return an access token");
  }
  const providerUser = requireVerifiedSessionUser(session);
  const providerEmail = readEmail(providerUser.email);
  if (!providerEmail) {
    throw new Error("The identity provider did not return a valid email");
  }
  if (await isPermanentlyDeletedAccount(providerUser.id)) {
    throw new PermanentlyDeletedAccountError();
  }
  await requireMigratedProfileForEmail(providerEmail);
  const { user, profile } = await upsertVerifiedIdentity(supabaseClaims(providerUser));
  // Re-check after the identity upsert. A lifecycle purge may have started
  // between the first tombstone check and this point; middleware has the same
  // fail-closed guard for the final createSession race window.
  if (profile.accountStatus === "removed" || await isPermanentlyDeletedAccount(providerUser.id)) {
    throw new RemovedAccountError();
  }
  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at:
      typeof session.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + session.expires_in
        : undefined,
    password_recovery_authorized_until: options.passwordRecovery
      ? Math.floor(Date.now() / 1000) + PASSWORD_RECOVERY_TTL_SECONDS
      : undefined,
  };

  const priorSid = getSessionId(req);
  if (priorSid) await clearSession(res, priorSid);
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  req.log.info({ userId: user.id }, "Verified Supabase session created");
}

/**
 * Password sign-in and one-time OTP verification already return the verified
 * Supabase user. Use that identity instead of replaying the session bearer
 * token through the connector proxy, which authenticates proxy calls using the
 * project's credential rather than the end-user session.
 */
export function requireVerifiedSessionUser(
  session: SupabaseSession,
): SupabaseUser {
  const providerUser = session.user;
  const email = readEmail(providerUser?.email);
  if (
    !providerUser?.id ||
    !email ||
    !(providerUser.email_confirmed_at || providerUser.confirmed_at)
  ) {
    throw new Error("The account service did not return a verified user");
  }
  return { ...providerUser, email };
}

function writeAuthError(res: Response, error: unknown): void {
  if (error instanceof IdentityConflictError) {
    res.status(409).json({
      error:
        "This email is already connected to a different Emmaus account. Please contact support.",
    });
    return;
  }
  if (error instanceof LegacyProfileMigrationRequiredError) {
    res.status(409).json({
      code: "LEGACY_PROFILE_MIGRATION_REQUIRED",
      error:
        "This Emmaus profile needs a secure migration before email and password can be used. Please contact your Emmaus administrator.",
    });
    return;
  }
  if (error instanceof RemovedAccountError || error instanceof PermanentlyDeletedAccountError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof SupabaseAuthError) {
    if (error.status === 401 || error.status === 400) {
      res.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    if (error.status === 403) {
      res.status(403).json({
        error: "Please verify your email address before signing in.",
      });
      return;
    }
    if (error.status >= 500) {
      res.status(503).json({
        error: "The account service is temporarily unavailable. Please try again.",
      });
      return;
    }
  }
  res.status(400).json({ error: "We could not complete that account request." });
}

type SupabaseAuthFailureCategory =
  | "invalid_credentials"
  | "email_confirmation"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_rejected"
  | "unknown";

function classifySupabaseAuthFailure(
  error: SupabaseAuthError,
): SupabaseAuthFailureCategory {
  const code = error.code?.toLowerCase() ?? "";
  if (
    code.includes("invalid_credentials") ||
    code.includes("invalid_login_credentials") ||
    code === "invalid_grant"
  ) {
    return "invalid_credentials";
  }
  if (
    code.includes("email_not_confirmed") ||
    code.includes("email_confirmation") ||
    error.status === 403
  ) {
    return "email_confirmation";
  }
  if (error.status === 429 || code.includes("rate")) {
    return "rate_limited";
  }
  if (error.status >= 500) return "provider_unavailable";
  if (error.status === 400 || error.status === 401) {
    return "provider_rejected";
  }
  return "unknown";
}

export function createSupabaseLoginFailureLog(input: {
  route: string;
  providerStatus: number;
  providerCode?: string;
  category: SupabaseAuthFailureCategory;
  correlationId: string;
  existingProductionIdentity: "matched" | "not_found" | "lookup_failed";
  buildId: string;
}): Record<string, string | number> {
  return {
    event: "auth_login_provider_failure",
    route: input.route,
    providerStatus: input.providerStatus,
    providerCode: input.providerCode ?? "unknown",
    category: input.category,
    correlationId: input.correlationId,
    existingProductionIdentity: input.existingProductionIdentity,
    buildId: input.buildId,
  };
}

function getAuthBuildId(): string {
  return (
    process.env.REPLIT_DEPLOYMENT_ID ??
    process.env.REPLIT_BUILD_ID ??
    process.env.REPLIT_COMMIT_SHA ??
    "unknown"
  );
}

async function getExistingProductionIdentity(
  email: string,
): Promise<"matched" | "not_found" | "lookup_failed"> {
  try {
    const [profile] = await db
      .select({ authSubject: userProfilesTable.authSubject })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.email, email))
      .limit(1);
    return profile?.authSubject ? "matched" : "not_found";
  } catch {
    return "lookup_failed";
  }
}

async function logSupabaseLoginFailure(
  req: Request,
  email: string,
  error: SupabaseAuthError,
): Promise<void> {
  const log = createSupabaseLoginFailureLog({
    route: req.originalUrl.split("?")[0],
    providerStatus: error.status,
    providerCode: error.code,
    category: classifySupabaseAuthFailure(error),
    correlationId:
      req.id === undefined || req.id === null ? "unknown" : String(req.id),
    existingProductionIdentity: await getExistingProductionIdentity(email),
    buildId: getAuthBuildId(),
  });
  logger.warn(log, "Supabase password login rejected");
}

authRouter.get(
  "/auth/user",
  async (req: Request, res: Response): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const sid = getSessionId(req);
    const session = sid ? await getSession(sid) : null;
    const passwordRecovery =
      req.isAuthenticated() &&
      session?.user.id === req.user.id &&
      typeof session.password_recovery_authorized_until === "number" &&
      session.password_recovery_authorized_until >= Math.floor(Date.now() / 1000);
    res.json({
      user: req.isAuthenticated() ? req.user : null,
      passwordRecovery,
    });
  },
);

authRouter.post(
  "/auth/signup",
  async (req: Request, res: Response): Promise<void> => {
    const email = readEmail(req.body?.email);
    const password = readPassword(req.body?.password);
    if (!email || !password) {
      res.status(400).json({
        error: "Enter a valid email address and a password of at least 8 characters.",
      });
      return;
    }

    try {
      const returnTo = readSafeReturnTo(req.body?.returnTo);
      await requireMigratedProfileForEmail(email);
      await signUpWithPassword({
        email,
        password,
        redirectTo: getAuthRedirectUrl(returnTo),
      });
      logger.info({ event: "confirmation_requested", emailDomain: email.split("@")[1] }, "Auth confirmation requested");
      // Deliberately generic: do not expose whether this email already exists.
      res.status(202).json({
        message:
          "If this address can create an account, we have sent a verification email.",
      });
    } catch (error) {
      const authError = error instanceof SupabaseAuthError ? {
        providerStatus: error.status,
        providerCode: error.code,
      } : {};
      logger.warn(
        { event: "confirmation_rejected", emailDomain: email.split("@")[1], ...authError },
        "Auth confirmation request rejected by Supabase",
      );
      writeAuthError(res, error);
    }
  },
);

authRouter.post(
  "/auth/resend-confirmation",
  async (req: Request, res: Response): Promise<void> => {
    const email = readEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    try {
      const returnTo = readSafeReturnTo(req.body?.returnTo);
      await resendConfirmationEmail({
        email,
        redirectTo: getAuthRedirectUrl(returnTo),
      });
      logger.info(
        { event: "confirmation_accepted", emailDomain: email.split("@")[1] },
        "Auth confirmation resend accepted by Supabase",
      );
      res.status(202).json({
        message: "If this address has an unverified Emmaus account, a verification email has been requested.",
      });
    } catch (error) {
      const authError = error instanceof SupabaseAuthError ? {
        providerStatus: error.status,
        providerCode: error.code,
      } : {};
      logger.warn(
        { event: "confirmation_rejected", emailDomain: email.split("@")[1], ...authError },
        "Auth confirmation resend rejected by Supabase",
      );
      writeAuthError(res, error);
    }
  },
);

authRouter.post(
  "/auth/login",
  async (req: Request, res: Response): Promise<void> => {
    const email = readEmail(req.body?.email);
    const password = readPassword(req.body?.password);
    if (!email || !password) {
      res.status(400).json({ error: "Enter your email address and password." });
      return;
    }

    try {
      await requireMigratedProfileForEmail(email);
      const session = await signInWithPassword({ email, password });
      await establishSession(req, res, session);
      res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof SupabaseAuthError) {
        await logSupabaseLoginFailure(req, email, error);
      }
      writeAuthError(res, error);
    }
  },
);

authRouter.get(
  "/auth/callback",
  async (req: Request, res: Response): Promise<void> => {
    const tokenHash =
      typeof req.query.token_hash === "string" ? req.query.token_hash : "";
    const type =
      req.query.type === "email" || req.query.type === "recovery"
        ? req.query.type
        : null;
    const returnTo = readSafeReturnTo(req.query.returnTo);
    req.log.info(
      {
        callbackPath: req.path,
        type: type ?? "invalid",
        hasTokenHash: Boolean(tokenHash),
      },
      "Supabase account-link callback received",
    );
    if (!tokenHash || !type) {
      const target = new URL(`${getCanonicalPublicOrigin()}/auth/callback`);
      target.searchParams.set("error", "invalid-link");
      if (returnTo) target.searchParams.set("returnTo", returnTo);
      res.redirect(303, target.toString());
      return;
    }

    try {
      const session = await verifySupabaseOtp({
        tokenHash,
        type,
      });
      await establishSession(req, res, session, {
        passwordRecovery: type === "recovery",
      });
      if (type === "recovery") {
        res.redirect(303, getRecoveryPageUrl(returnTo));
      } else {
        res.redirect(303, returnTo
          ? `${getCanonicalPublicOrigin()}${returnTo}`
          : getCanonicalPublicOrigin());
      }
    } catch (error) {
      if (error instanceof LegacyProfileMigrationRequiredError) {
        res.redirect(
          303,
          `${getCanonicalPublicOrigin()}/auth?error=legacy-account-migration${
            returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
          }`,
        );
        return;
      }
      req.log.warn({ err: error }, "Supabase account-link verification failed");
      const target = new URL(`${getCanonicalPublicOrigin()}/auth/callback`);
      target.searchParams.set("error", "expired-link");
      if (returnTo) target.searchParams.set("returnTo", returnTo);
      res.redirect(303, target.toString());
    }
  },
);

authRouter.post(
  "/auth/recover",
  async (req: Request, res: Response): Promise<void> => {
    const email = readEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    try {
      const returnTo = readSafeReturnTo(req.body?.returnTo);
      await requireMigratedProfileForEmail(email);
      await sendPasswordRecoveryEmail({
        email,
        redirectTo: getAuthRedirectUrl(returnTo),
      });
      res.status(202).json({
        message:
          "If an account exists for this email, we have sent password reset instructions.",
      });
    } catch (error) {
      writeAuthError(res, error);
    }
  },
);

authRouter.post(
  "/auth/password",
  async (req: Request, res: Response): Promise<void> => {
    const password = readPassword(req.body?.password);
    const sid = getSessionId(req);
    const session = sid
      ? await consumePasswordRecoveryAuthorization(sid)
      : null;
    if (!session?.user.id || !password) {
      res.status(400).json({
        error: "Open a valid password reset link, then choose a password between 8 and 128 characters.",
      });
      return;
    }

    try {
      // A one-use recovery capability exists only after a verified Supabase
      // recovery link. Use the connector's server credential for this
      // administrative update so browser/provider session tokens are never
      // replayed through the proxy.
      await updateSupabasePassword({ userId: session.user.id, password });
      res.status(200).json({ ok: true });
    } catch (error) {
      writeAuthError(res, error);
    }
  },
);

authRouter.post(
  "/logout",
  async (req: Request, res: Response): Promise<void> => {
    const sid = getSessionId(req);
    const session = sid ? await getSession(sid) : null;
    await clearSession(res, sid);
    if (session?.access_token) {
      try {
        await revokeSupabaseSession(session.access_token);
      } catch {
        // The opaque Emmaus session is already deleted, which is the local
        // security boundary even when the provider is temporarily unavailable.
      }
    }
    res.status(200).json({ ok: true });
  },
);

authRouter.post("/auth/session", (_req: Request, res: Response): void => {
  res.status(410).json({
    error: "Legacy session creation has been removed. Use verified sign-in.",
  });
});

authRouter.get(
  "/users/profile",
  (req: Request, res: Response): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ preferredName: req.user.preferredName });
  },
);

authRouter.get(
  "/users/appearance",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const [profile] = await db
      .select({
        theme: userProfilesTable.appearanceTheme,
        fontSize: userProfilesTable.appearanceTextSize,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.authSubject, req.user.id))
      .limit(1);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      theme: profile?.theme === "dark" ? "dark" : "light",
      fontSize:
        profile?.fontSize === "large" || profile?.fontSize === "extra-large"
          ? profile.fontSize
          : "standard",
    });
  },
);

authRouter.put(
  "/users/appearance",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const theme = req.body?.theme;
    const fontSize = req.body?.fontSize;
    if (
      (theme !== "light" && theme !== "dark") ||
      (fontSize !== "standard" && fontSize !== "large" && fontSize !== "extra-large")
    ) {
      res.status(400).json({ error: "Invalid appearance preferences." });
      return;
    }

    const [profile] = await db
      .update(userProfilesTable)
      .set({
        appearanceTheme: theme,
        appearanceTextSize: fontSize,
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.authSubject, req.user.id))
      .returning({
        theme: userProfilesTable.appearanceTheme,
        fontSize: userProfilesTable.appearanceTextSize,
      });

    if (!profile) {
      res.status(409).json({ error: "The verified account profile is not ready." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(profile);
  },
);

authRouter.post(
  "/users/profile",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const preferredName =
      typeof req.body?.preferredName === "string"
        ? req.body.preferredName.trim()
        : "";
    if (!preferredName || preferredName.length > 80) {
      res.status(400).json({
        error: "Preferred name must be between 1 and 80 characters.",
      });
      return;
    }

    const [profile] = await db
      .update(userProfilesTable)
      .set({ preferredName, updatedAt: new Date() })
      .where(eq(userProfilesTable.authSubject, req.user.id))
      .returning({ preferredName: userProfilesTable.preferredName });

    if (!profile) {
      res.status(409).json({
        error: "The verified account profile is not ready.",
      });
      return;
    }
    res.json(profile);
  },
);