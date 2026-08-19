import {
  authBootstrapStateTable,
  db,
  userProfilesTable,
  usersTable,
  type UserRole,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  clearSession,
  createSession,
  getOidcConfig,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/oidc-auth.js";
import { getCanonicalPublicOrigin } from "../lib/public-origin.js";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

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

function setOidcCookie(
  res: Response,
  name: string,
  value: string,
): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function clearOidcCookies(res: Response): void {
  for (const name of ["code_verifier", "nonce", "state", "return_to"]) {
    res.clearCookie(name, { path: "/" });
  }
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
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

class IdentityConflictError extends Error {
  constructor() {
    super("This verified email is already bound to another identity.");
    this.name = "IdentityConflictError";
  }
}

async function upsertVerifiedIdentity(claims: Record<string, unknown>) {
  const subject = claimString(claims, "sub");
  if (!subject) throw new Error("OIDC token did not contain a subject");

  const emailVerified = claims.email_verified === true;
  const claimedEmail = claimString(claims, "email")?.toLowerCase() ?? null;
  const verifiedEmail = emailVerified ? claimedEmail : null;
  const firstName = claimString(claims, "first_name", "given_name");
  const lastName = claimString(claims, "last_name", "family_name");
  const profileImageUrl = claimString(
    claims,
    "profile_image_url",
    "picture",
  );

  return db.transaction(async (tx) => {
    if (verifiedEmail) {
      const [emailOwner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, verifiedEmail));
      if (emailOwner && emailOwner.id !== subject) {
        throw new IdentityConflictError();
      }
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
          ...(verifiedEmail ? { email: verifiedEmail } : {}),
          firstName,
          lastName,
          profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    let [profile] = await tx
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.authSubject, subject));

    if (!profile && verifiedEmail) {
      const [emailProfile] = await tx
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.email, verifiedEmail));

      if (emailProfile?.authSubject && emailProfile.authSubject !== subject) {
        throw new IdentityConflictError();
      }

      if (emailProfile) {
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

    const bootstrapEmail =
      process.env.EMMAUS_INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapKey = "initial-superadmin";
    const [bootstrapState] = await tx
      .select()
      .from(authBootstrapStateTable)
      .where(eq(authBootstrapStateTable.key, bootstrapKey));

    if (!bootstrapState && bootstrapEmail) {
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
      } else if (
        profile &&
        verifiedEmail === bootstrapEmail &&
        profile.authSubject === subject
      ) {
        const [claim] = await tx
          .insert(authBootstrapStateTable)
          .values({ key: bootstrapKey, claimedBy: subject })
          .onConflictDoNothing()
          .returning();

        if (claim) {
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
      }
    }

    return { user, profile };
  });
}

authRouter.get("/auth/user", (req: Request, res: Response): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

authRouter.get("/login", async (req: Request, res: Response): Promise<void> => {
  const config = await getOidcConfig();
  const callbackUrl = `${getCanonicalPublicOrigin()}/api/callback`;
  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);
  res.redirect(redirectTo.href);
});

authRouter.get(
  "/callback",
  async (req: Request, res: Response): Promise<void> => {
    const config = await getOidcConfig();
    const publicOrigin = getCanonicalPublicOrigin();
    const callbackUrl = `${publicOrigin}/api/callback`;
    const codeVerifier = req.cookies?.code_verifier;
    const nonce = req.cookies?.nonce;
    const expectedState = req.cookies?.state;

    if (!codeVerifier || !expectedState) {
      res.redirect("/api/login");
      return;
    }

    const returnTo = getSafeReturnTo(req.cookies?.return_to);
    const requestUrl = new URL(req.originalUrl, publicOrigin);
    const currentUrl = new URL(callbackUrl);
    currentUrl.search = requestUrl.search;

    try {
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: String(codeVerifier),
        expectedNonce: nonce ? String(nonce) : undefined,
        expectedState: String(expectedState),
        idTokenExpected: true,
      });

      const idTokenClaims = tokens.claims();
      if (!idTokenClaims?.sub) {
        throw new Error("OIDC token did not contain a subject");
      }

      let claims = idTokenClaims as unknown as Record<string, unknown>;
      if (tokens.access_token) {
        try {
          const userInfo = await oidc.fetchUserInfo(
            config,
            tokens.access_token,
            idTokenClaims.sub,
          );
          claims = {
            ...claims,
            ...userInfo,
            sub: idTokenClaims.sub,
          };
        } catch (error) {
          if (typeof idTokenClaims.email !== "string") throw error;
          req.log.warn(
            { err: error },
            "OIDC UserInfo unavailable; using verified ID token claims",
          );
        }
      }

      if (
        typeof claims.email !== "string" ||
        !claims.email.trim() ||
        claims.email_verified !== true
      ) {
        throw new Error("The identity provider did not return a verified email");
      }

      const { user } = await upsertVerifiedIdentity(claims);
      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn()
          ? now + tokens.expiresIn()!
          : typeof claims.exp === "number"
            ? claims.exp
            : undefined,
      };

      const priorSid = getSessionId(req);
      if (priorSid) await clearSession(res, priorSid);
      const sid = await createSession(sessionData);
      setSessionCookie(res, sid);
      clearOidcCookies(res);
      req.log.info({ userId: user.id }, "Verified OIDC session created");
      res.redirect(returnTo);
    } catch (error) {
      clearOidcCookies(res);
      req.log.warn(
        {
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "OIDC callback rejected",
      );
      const appRoot = returnTo.replace(/\/+$/, "");
      res.redirect(`${appRoot}/auth?error=signin`);
    }
  },
);

authRouter.post(
  "/logout",
  async (req: Request, res: Response): Promise<void> => {
    const origin = getCanonicalPublicOrigin();
    const returnTo = getSafeReturnTo(req.query.returnTo);
    const postLogoutRedirectUrl = new URL(returnTo, `${origin}/`).href;
    const sid = getSessionId(req);
    await clearSession(res, sid);

    try {
      const config = await getOidcConfig();
      const endSessionUrl = oidc.buildEndSessionUrl(config, {
        client_id: process.env.REPL_ID!,
        post_logout_redirect_uri: postLogoutRedirectUrl,
      });
      res.redirect(endSessionUrl.href);
    } catch {
      res.redirect(returnTo);
    }
  },
);

// The legacy endpoint accepted an arbitrary browser-supplied userId.
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