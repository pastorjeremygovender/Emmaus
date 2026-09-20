import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";
import { getSession } from "../../lib/oidc-auth.ts";

if (
  process.env.NODE_ENV !== "test" ||
  process.env.ALLOW_TEST_AUTH_HARNESS !== "1" ||
  process.env.REPLIT_DEPLOYMENT
) {
  throw new Error(
    "auth-recovery-status.test must run only with the explicit test auth harness",
  );
}

let server: http.Server;
let baseUrl: string;

before(async () => {
  const [
    { default: express },
    { authMiddleware },
    { authRouter },
  ] = await Promise.all([
    import("express"),
    import("../../middlewares/authMiddleware.ts"),
    import("../auth.ts"),
  ]);
  const app = express();
  app.use((_req, _res, next) => {
    (_req as unknown as { log: { warn: () => void } }).log = { warn: () => {} };
    next();
  });
  app.use(authMiddleware);
  app.use("/api", authRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await cleanupTestAuth();
});

describe("GET /api/auth/user recovery status", () => {
  it("reports an active password-recovery capability to route the browser to the reset form", async () => {
    const headers = await authHeader("recovery-status");
    const sid = headers.Authorization.slice("Bearer ".length);
    const session = await getSession(sid);
    assert.ok(session, "test session must exist");
    await db
      .update(sessionsTable)
      .set({
        sess: {
          ...session,
          password_recovery_authorized_until: Math.floor(Date.now() / 1000) + 60,
        },
      })
      .where(eq(sessionsTable.sid, sid));

    const response = await fetch(`${baseUrl}/api/auth/user`, { headers });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      user: { id: string } | null;
      passwordRecovery: boolean;
    };
    assert.equal(body.user?.id, session.user.id);
    assert.equal(body.passwordRecovery, true);
  });

  it("does not label an ordinary session as password recovery", async () => {
    const headers = await authHeader("ordinary-status");
    const response = await fetch(`${baseUrl}/api/auth/user`, { headers });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { passwordRecovery: boolean };
    assert.equal(body.passwordRecovery, false);
  });
});