import {
  authBootstrapStateTable,
  db,
  userProfilesTable,
  usersTable,
  type UserRole,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  clearSession,
  consumePasswordRecoveryAuthorization,
  createSession,
  getSession,
  getSessionId,
  PASSWORD_RECOVERY_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/oidc-auth.js";
import { getCanonicalPublicOrigin } from "../lib/public-origin.js";
import {
  getVerifiedSupabaseUser,
  revokeSupabaseSession,
  sendPasswordRecoveryEmail,
  signInWithPassword,
  signUpWithPassword,
  SupabaseAuthError,
  type SupabaseSession,
  type SupabaseUser,
  updateSupabasePassword,
  verifySupabaseOtp,
} from "../lib/supabase-auth.js";

export const authRouter = Router();

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
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

function getAuthRedirectUrl(): string {
  return `${getCanonicalPublicOrigin()}/api/auth/callback`;
}

function getRecoveryPageUrl(): string {
  return `${getCanonicalPublicOrigin()}/auth/callback?mode=recovery`;
}

class IdentityConflictError extends Error {
  constructor() {
    super("This verified email is already bound to another identity.");
    this.name = "IdentityConflictError";
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
  const bootstrapEmail =
    process.env.EMMAUS_INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const isConfiguredInitialOwner = bootstrapEmail === verifiedEmail;

  if (!verifiedEmail) {
    throw new Error("The identity provider did not return a verified email");
  }

  return db.transaction(async (tx) => {
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
    if (isConfiguredInitialOwner) {
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
  const providerUser = await getVerifiedSupabaseUser(session.access_token);
  const { user } = await upsertVerifiedIdentity(supabaseClaims(providerUser));
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

function writeAuthError(res: Response, error: unknown): void {
  if (error instanceof IdentityConflictError) {
    res.status(409).json({
      error:
        "This email is already connected to a different Emmaus account. Please contact support.",
    });
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
      await signUpWithPassword({
        email,
        password,
        redirectTo: getAuthRedirectUrl(),
      });
      // Deliberately generic: do not expose whether this email already exists.
      res.status(202).json({
        message:
          "If this address can create an account, we have sent a verification email.",
      });
    } catch (error) {
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
      const session = await signInWithPassword({ email, password });
      await establishSession(req, res, session);
      res.status(200).json({ ok: true });
    } catch (error) {
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
    if (!tokenHash || !type) {
      res.redirect(303, `${getCanonicalPublicOrigin()}/auth/callback?error=invalid-link`);
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
      res.redirect(303, type === "recovery" ? getRecoveryPageUrl() : getCanonicalPublicOrigin());
    } catch (error) {
      req.log.warn({ err: error }, "Supabase account-link verification failed");
      res.redirect(303, `${getCanonicalPublicOrigin()}/auth/callback?error=expired-link`);
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
      await sendPasswordRecoveryEmail({
        email,
        redirectTo: getAuthRedirectUrl(),
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
    if (!session?.access_token || !password) {
      res.status(400).json({
        error: "Open a valid password reset link, then choose a password between 8 and 128 characters.",
      });
      return;
    }

    try {
      await getVerifiedSupabaseUser(session.access_token);
      await updateSupabasePassword({ accessToken: session.access_token, password });
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