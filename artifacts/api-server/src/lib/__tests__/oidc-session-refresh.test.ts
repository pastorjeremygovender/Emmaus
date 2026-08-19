/**
 * Integration coverage for concurrency-safe expired-token refresh. A
 * controllable local Supabase auth service, real session rows, and the
 * production middleware prove that a row lock permits only one rotation.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run test:unit
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";
import type { SessionData } from "../oidc-auth.ts";

const validUser = {
  id: "user-sub-1",
  email: "a@b.test",
  firstName: "A",
  lastName: "B",
  profileImageUrl: null,
};

let parseStoredSession: (raw: unknown) => SessionData | null;
let getSession: (sid: string) => Promise<SessionData | null>;
let testServer: http.Server;

let providerServer: http.Server;
let providerServer: http.Server;
let baseUrl: string;

let providerUrl: string;
let providerUrl: string;
let refreshGrantCount = 0;
let releaseRefresh: (() => void) | undefined;
let refreshStarted!: Promise<void>;
let signalRefreshStarted!: () => void;
let concurrentRequestArrived!: Promise<void>;
let signalConcurrentRequestArrived!: () => void;
let authenticatedRequestCount = 0;

describe("parseStoredSession", () => {
  it("accepts a well-formed session blob", () => {
    const parsed = parseStoredSession({
      user: validUser,
      access_token: "at",
      refresh_token: "rt",
      expires_at: 123,
    });
    assert.ok(parsed);
    assert.equal(parsed.user.id, "user-sub-1");
    assert.equal(parsed.access_token, "at");
    assert.equal(parsed.refresh_token, "rt");
    assert.equal(parsed.expires_at, 123);
  });

  it("rejects incomplete stored session blobs", () => {
    assert.equal(parseStoredSession(null), null);
    assert.equal(parseStoredSession({ access_token: "at" }), null);
    assert.equal(
      parseStoredSession({ user: { id: 5 }, access_token: "at" }),
      null,
    );
    assert.equal(parseStoredSession({ user: validUser }), null);
  });
});

before(async () => {
  providerServer = http.createServer(async (req, res) => {
    if (
      req.method === "POST" &&
      req.url === "/auth/v1/token?grant_type=refresh_token"
    ) {
      const body = await new Promise<string>((resolve) => {
        let data = "";
        req.on("data", (chunk) => { data += chunk; });
        req.on("end", () => resolve(data));
      });
      const grant = JSON.parse(body) as { refresh_token?: string };
      refreshGrantCount += 1;
      signalRefreshStarted();

      if (grant.refresh_token === "rejected-refresh-token") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }

      await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
      }));
      return;
    }

    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) =>
    providerServer.listen(0, "127.0.0.1", resolve)
  );
  const providerAddress = providerServer.address() as { port: number };
  providerUrl = `http://127.0.0.1:${providerAddress.port}`;
  process.env.SUPABASE_AUTH_TEST_URL = providerUrl;

  const sessionAuth = await import("../oidc-auth.ts");
  parseStoredSession = sessionAuth.parseStoredSession;
  getSession = sessionAuth.getSession;
  const { authMiddleware } = await import("../../middlewares/authMiddleware.ts");
  const { default: express } = await import("express");
  const app = express();
  app.use("/whoami", (_req, _res, next) => {
    authenticatedRequestCount += 1;
    if (authenticatedRequestCount === 2) signalConcurrentRequestArrived();
    next();
  });
  app.use(authMiddleware);
  app.get("/whoami", async (req, res) => {
    const sid = headers.Authorization.slice("Bearer ".length);
    const session = sid ? await sessionAuth.getSession(sid) : null;
    res.status(req.isAuthenticated() ? 200 : 401).json({
      userId: req.user?.id ?? null,
      accessToken: session?.access_token ?? null,
    });
  });
  testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const address = testServer.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  const closers: Promise<void>[] = [];
  if (testServer) {
    closers.push(new Promise<void>((resolve, reject) =>
      testServer.close((error) => error ? reject(error) : resolve()),
    ));
  }
  if (providerServer) {
    closers.push(new Promise<void>((resolve, reject) =>
      providerServer.close((error) => error ? reject(error) : resolve()),
    ));
  }
  await Promise.all(closers);
  delete process.env.SUPABASE_AUTH_TEST_URL;
  await cleanupTestAuth();
});

async function expireSession(sid: string, refreshToken: string): Promise<void> {
  const current = await getSession(sid);
  assert.ok(current, "test session must exist before it is expired");
  await db.update(sessionsTable).set({
    sess: {
      user: current.user,
      access_token: "expired-access-token",
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) - 60,
    },
  }).where(eq(sessionsTable.sid, sid));
}

async function whoAmI(headers: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/whoami`, { headers });
}

describe("expired Supabase sessions", () => {
  it("shares one rotated session between simultaneous authenticated requests", async () => {
    const headers = await authHeader("session-refresh-concurrency");
    const sid = headers.Authorization.slice("Bearer ".length);
    await expireSession(sid, "single-use-refresh-token");
    refreshGrantCount = 0;
    refreshStarted = new Promise<void>((resolve) => {
      signalRefreshStarted = resolve;
    });
    authenticatedRequestCount = 0;
    concurrentRequestArrived = new Promise<void>((resolve) => {
      signalConcurrentRequestArrived = resolve;
    });

    const first = whoAmI(headers);
    await refreshStarted;
    const second = whoAmI(headers);
    await concurrentRequestArrived;
    releaseRefresh?.();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    assert.equal(refreshGrantCount, 1, "the provider must receive one refresh grant");
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    const firstSession = await firstResponse.json() as {
      userId: string;
      accessToken: string;
    };
    const secondSession = await secondResponse.json() as {
      userId: string;
      accessToken: string;
    };
    assert.deepEqual(firstSession, secondSession);
    assert.equal(firstSession.accessToken, "fresh-access-token");

    const refreshed = await getSession(sid);
    assert.equal(refreshed?.access_token, "fresh-access-token");
    assert.equal(refreshed?.refresh_token, "fresh-refresh-token");
    assert.ok((refreshed?.expires_at ?? 0) > Math.floor(Date.now() / 1000));
  });

  it("clears a rejected refresh without invalidating another refreshed session", async () => {
    const healthyHeaders = await authHeader("session-refresh-healthy");
    const rejectedHeaders = await authHeader("session-refresh-rejected");
    const healthySid = healthyHeaders.Authorization.slice("Bearer ".length);
    const rejectedSid = rejectedHeaders.Authorization.slice("Bearer ".length);
    await expireSession(healthySid, "already-fresh-refresh-token");
    await expireSession(rejectedSid, "rejected-refresh-token");

    refreshGrantCount = 0;
    refreshStarted = new Promise<void>((resolve) => {
      signalRefreshStarted = resolve;
    });
    const healthyRequest = whoAmI(healthyHeaders);
    await refreshStarted;
    releaseRefresh?.();
    assert.equal((await healthyRequest).status, 200);

    const rejectedResponse = await whoAmI(rejectedHeaders);
    assert.equal(rejectedResponse.status, 401);
    assert.equal(await getSession(rejectedSid), null);
    assert.equal((await getSession(healthySid))?.access_token, "fresh-access-token");
  });
});

  const sessionAuth = await import("../oidc-auth.ts");
