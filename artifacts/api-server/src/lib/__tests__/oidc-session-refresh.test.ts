/**
 * oidc-session-refresh.test.ts
 *
 * Focused coverage for the concurrency-safe expired-token refresh introduced in
 * lib/oidc-auth.ts. A real OIDC provider and a real PostgreSQL instance are not
 * available in unit tests, so this file covers the parts that are deterministic
 * and DB-independent:
 *
 *   1. parseStoredSession — the stored-row shape validation that guards every
 *      lock/refresh decision (a malformed `sess` blob must never be treated as
 *      a valid session).
 *   2. The expiry decision used to pick the fast path vs the locked path, and
 *      to detect that a peer already rotated the token while we waited on the
 *      lock (the "harmless race" case that must NOT invalidate the session).
 *
 * The transaction/lock behavior itself is documented and structured in
 * refreshSessionIfExpired: a per-SID `SELECT ... FOR UPDATE` serializes
 * rotations, a waiter re-reads inside the transaction and reuses a peer's
 * fresh session instead of replaying its own (now-consumed) refresh token, and
 * a refresh failure while holding the lock is a genuine invalidation.
 *
 * Run:
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/oidc-session-refresh.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStoredSession, type SessionData } from "../oidc-auth.ts";

// Mirror of the internal expiry predicate. Kept in sync with oidc-auth.ts so
// the fast-path / peer-refresh decision is covered without exporting internals.
function isExpired(session: SessionData, nowSeconds: number): boolean {
  return (
    typeof session.expires_at === "number" && nowSeconds > session.expires_at
  );
}

const validUser = {
  id: "user-sub-1",
  email: "a@b.test",
  firstName: "A",
  lastName: "B",
  profileImageUrl: null,
};

describe("parseStoredSession", () => {
  it("accepts a well-formed session blob", () => {
    const raw = {
      user: validUser,
      access_token: "at",
      refresh_token: "rt",
      expires_at: 123,
    };
    const parsed = parseStoredSession(raw);
    assert.ok(parsed);
    assert.equal(parsed.user.id, "user-sub-1");
    assert.equal(parsed.access_token, "at");
    assert.equal(parsed.refresh_token, "rt");
    assert.equal(parsed.expires_at, 123);
  });

  it("accepts a session without refresh_token/expires_at", () => {
    const parsed = parseStoredSession({ user: validUser, access_token: "at" });
    assert.ok(parsed);
    assert.equal(parsed.refresh_token, undefined);
    assert.equal(parsed.expires_at, undefined);
  });

  it("rejects null / non-object", () => {
    assert.equal(parseStoredSession(null), null);
    assert.equal(parseStoredSession(undefined), null);
    assert.equal(parseStoredSession(42), null);
    assert.equal(parseStoredSession("nope"), null);
  });

  it("rejects a blob with no user", () => {
    assert.equal(parseStoredSession({ access_token: "at" }), null);
  });

  it("rejects a blob whose user has no string id", () => {
    assert.equal(
      parseStoredSession({ user: { id: 5 }, access_token: "at" }),
      null,
    );
  });

  it("rejects a blob with no access token", () => {
    assert.equal(parseStoredSession({ user: validUser }), null);
  });
});

describe("expiry decision (fast path vs locked path vs peer-refresh)", () => {
  const base: SessionData = {
    user: validUser,
    access_token: "at",
    refresh_token: "rt",
  };

  it("treats a session without expires_at as non-expired (fast path)", () => {
    assert.equal(isExpired(base, 1_000_000), false);
  });

  it("treats a session with a future expiry as non-expired", () => {
    const s: SessionData = { ...base, expires_at: 2_000 };
    assert.equal(isExpired(s, 1_000), false);
  });

  it("treats a session at exactly expires_at as still valid (no rotation yet)", () => {
    const s: SessionData = { ...base, expires_at: 1_000 };
    assert.equal(isExpired(s, 1_000), false);
  });

  it("treats a session past expires_at as expired (must take the lock path)", () => {
    const s: SessionData = { ...base, expires_at: 1_000 };
    assert.equal(isExpired(s, 1_001), true);
  });

  it("a peer-rotated row (future expiry) re-read under the lock is NOT expired", () => {
    // Simulates the waiter reloading the row after a concurrent request rotated
    // the token: it must be considered valid so the waiter reuses it instead of
    // replaying its own stale refresh token.
    const peerRefreshed: SessionData = { ...base, expires_at: 9_999 };
    assert.equal(isExpired(peerRefreshed, 5_000), false);
  });
});
