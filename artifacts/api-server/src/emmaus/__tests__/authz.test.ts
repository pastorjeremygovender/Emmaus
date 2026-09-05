/**
 * Emmaus Authorization Integration Tests
 *
 * Verifies ownership enforcement on all Emmaus data-access and write routes.
 * Runs against the live dev server (process.env.TEST_SERVER_URL or localhost:8080).
 *
 * Usage:
 *   pnpm run build && node --test --experimental-strip-types src/emmaus/__tests__/authz.test.ts
 *   or via:
 *   TEST_SERVER_URL=http://localhost:8080 node --test --experimental-strip-types ...
 */

import http from "node:http";
import https from "node:https";
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  authHeader,
  cleanupTestAuth,
  testUserIdFor,
} from "../../test-utils/test-auth.ts";
import { pool } from "@workspace/db";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const url = new URL(BASE_URL);
const isHttps = url.protocol === "https:";
const transport = isHttps ? https : http;

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function request(opts: {
  method: string;
  path: string;
  userId?: string;
  body?: object;
}): Promise<{ status: number; body: string }> {
  // Members authenticate with a real opaque session (app_role "user"). Requests
  // without a userId stay unauthenticated so negative-case 401s still hold.
  const authHeaders = opts.userId
    ? await authHeader(opts.userId, { role: "user" })
    : {};
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaders,
    };
    if (payload) headers["Content-Length"] = String(Buffer.byteLength(payload));

    const req = transport.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || (isHttps ? 443 : 80),
        method: opts.method,
        path: opts.path,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Start a new conversation as userId; return the conversationId from the SSE done event. */
async function startConversation(userId: string, message = "Help me understand prayer"): Promise<string> {
  const res = await request({
    method: "POST",
    path: "/api/emmaus/conversation",
    userId,
    body: { message, context: { entryPoint: "personal" } },
  });
  assert.equal(res.status, 200, `SSE stream should return 200 (got ${res.status})`);

  for (const line of res.body.split("\n")) {
    if (line.includes('"type":"done"')) {
      const data = JSON.parse(line.replace(/^data:\s*/, ""));
      assert.ok(data.conversationId, "done event must include conversationId");
      return data.conversationId as string;
    }
  }
  throw new Error(`No done event received.\nResponse:\n${res.body.slice(0, 500)}`);
}

async function donePayload(responseBody: string): Promise<Record<string, any>> {
  const line = responseBody.split("\n").find((candidate) => candidate.includes('"type":"done"'));
  assert.ok(line, `No done event received.\nResponse:\n${responseBody.slice(0, 500)}`);
  return JSON.parse(line!.replace(/^data:\s*/, "")) as Record<string, any>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Emmaus authz — unauthenticated requests", () => {
  it("POST /emmaus/conversation without identity returns 401", async () => {
    const res = await request({
      method: "POST",
      path: "/api/emmaus/conversation",
      // No userId — no cookie, no X-User-Id header
      body: { message: "Hello" },
    });
    assert.equal(res.status, 401, "unauthenticated start-conversation should return 401");
  });

  it("GET /emmaus/conversations without identity returns 401", async () => {
    const res = await request({ method: "GET", path: "/api/emmaus/conversations" });
    assert.equal(res.status, 401, "unauthenticated list should return 401");
  });

  it("GET /emmaus/conversation/:id/messages without identity returns 401", async () => {
    const res = await request({ method: "GET", path: "/api/emmaus/conversation/any-id/messages" });
    assert.equal(res.status, 401, "unauthenticated read should return 401");
  });

  it("POST /emmaus/conversation/:id/message without identity returns 401", async () => {
    const res = await request({
      method: "POST",
      path: "/api/emmaus/conversation/any-id/message",
      body: { message: "Hello" },
    });
    assert.equal(res.status, 401, "unauthenticated append should return 401");
  });

  it("POST /emmaus/memory without identity returns 401", async () => {
    const res = await request({
      method: "POST",
      path: "/api/emmaus/memory",
      body: { content: "Some note" },
    });
    assert.equal(res.status, 401, "unauthenticated memory save should return 401");
  });

  it("DELETE /emmaus/memory/:id without identity returns 401", async () => {
    const res = await request({ method: "DELETE", path: "/api/emmaus/memory/any-id" });
    assert.equal(res.status, 401, "unauthenticated memory delete should return 401");
  });
});

describe("Emmaus authz — read (messages)", () => {
  it("owner can read their own conversation messages", async () => {
    const convId = await startConversation("user-read-owner");
    const res = await request({
      method: "GET",
      path: `/api/emmaus/conversation/${convId}/messages`,
      userId: "user-read-owner",
    });
    assert.equal(res.status, 200, "owner should get 200");
    const msgs = JSON.parse(res.body);
    assert.ok(Array.isArray(msgs) && msgs.length >= 2, "should return at least user + assistant messages");
  });

  it("non-owner cannot read another user's conversation messages", async () => {
    const convId = await startConversation("user-alice-read");
    const res = await request({
      method: "GET",
      path: `/api/emmaus/conversation/${convId}/messages`,
      userId: "user-bob-read",
    });
    assert.equal(res.status, 403, "non-owner should get 403");
  });

  it("unknown conversation returns 404", async () => {
    const res = await request({
      method: "GET",
      path: "/api/emmaus/conversation/nonexistent-id-xyz/messages",
      userId: "user-anyone",
    });
    assert.equal(res.status, 404, "missing conversation should return 404");
  });
});

describe("Emmaus authz — write (append message)", () => {
  it("owner can append a message to their own conversation", async () => {
    const convId = await startConversation("user-append-owner");
    const res = await request({
      method: "POST",
      path: `/api/emmaus/conversation/${convId}/message`,
      userId: "user-append-owner",
      body: { message: "Tell me more about this" },
    });
    assert.equal(res.status, 200, "owner append should return 200 SSE stream");
    assert.ok(res.body.includes('"type":"done"'), "response should contain done event");
  });

  it("non-owner cannot append to another user's conversation", async () => {
    const convId = await startConversation("user-alice-write");
    const res = await request({
      method: "POST",
      path: `/api/emmaus/conversation/${convId}/message`,
      userId: "user-bob-write",
      body: { message: "Hijacking Alice's conversation" },
    });
    assert.equal(res.status, 403, "non-owner append should return 403");
  });

  it("appending to unknown conversation returns 404", async () => {
    const res = await request({
      method: "POST",
      path: "/api/emmaus/conversation/nonexistent-id-xyz/message",
      userId: "user-anyone",
      body: { message: "Does not matter" },
    });
    assert.equal(res.status, 404, "unknown conversation append should return 404");
  });
});

describe("Emmaus authz — list conversations", () => {
  it("users only see their own conversations", async () => {
    await startConversation("user-list-alice", "Alice message");
    await startConversation("user-list-bob", "Bob message");

    const aliceRes = await request({
      method: "GET",
      path: "/api/emmaus/conversations",
      userId: "user-list-alice",
    });
    const bobRes = await request({
      method: "GET",
      path: "/api/emmaus/conversations",
      userId: "user-list-bob",
    });

    const alice = JSON.parse(aliceRes.body) as { userId: string }[];
    const bob = JSON.parse(bobRes.body) as { userId: string }[];

    // Conversations are owned by the server-resolved verified user id (the real
    // session identity), not the logical test key.
    const aliceId = await testUserIdFor("user-list-alice", "user");
    const bobId = await testUserIdFor("user-list-bob", "user");

    assert.ok(
      alice.every((c) => c.userId === aliceId),
      "Alice should only see her own conversations"
    );
    assert.ok(
      bob.every((c) => c.userId === bobId),
      "Bob should only see his own conversations"
    );
  });
});

describe("Emmaus Jarvis foundation — typed boundary and owner scope", () => {
  it("emits the versioned contract for a canonical Bible action", async () => {
    const response = await request({
      method: "POST",
      path: "/api/emmaus/conversation",
      userId: "jarvis-contract-owner",
      body: {
        message: "Read John 3:16",
        context: { entryPoint: "personal" },
      },
    });
    assert.equal(response.status, 200);
    const payload = await donePayload(response.body);
    const contract = (payload.metadata as Record<string, any>).jarvis;
    assert.equal(contract.contractVersion, "jarvis.v1");
    assert.equal(contract.intent, "BIBLE_READ");
    assert.equal(contract.scriptureReferences[0].reference, "John 3:16");
    assert.match(contract.suggestedNextAction.route, /^\/bible\/read\/john\/3/);
  });

  it("does not expose one member's saved Bible position to another member", async () => {
    const ownerKey = "jarvis-position-owner";
    const otherKey = "jarvis-position-other";
    const ownerId = await testUserIdFor(ownerKey, "user");
    const otherId = await testUserIdFor(otherKey, "user");

    try {
      const saved = await request({
        method: "PATCH",
        path: "/api/bible/data",
        userId: ownerKey,
        body: {
          history: [{
            bookId: "john",
            bookName: "John",
            chapter: 3,
            chapterHeading: "The New Birth",
            openedAt: new Date().toISOString(),
          }],
        },
      });
      assert.equal(saved.status, 200);

      const ownerResponse = await request({
        method: "POST",
        path: "/api/emmaus/conversation",
        userId: ownerKey,
        body: { message: "Continue where I left off", context: { entryPoint: "personal" } },
      });
      const otherResponse = await request({
        method: "POST",
        path: "/api/emmaus/conversation",
        userId: otherKey,
        body: { message: "Continue where I left off", context: { entryPoint: "personal" } },
      });
      assert.equal(ownerResponse.status, 200);
      assert.equal(otherResponse.status, 200);

      const ownerContract = (await donePayload(ownerResponse.body)).metadata as Record<string, any>;
      const otherContract = (await donePayload(otherResponse.body)).metadata as Record<string, any>;
      assert.equal(ownerContract.jarvis.intent, "CONTINUE");
      assert.match(ownerContract.jarvis.pastoralText, /John 3/i);
      assert.doesNotMatch(otherContract.jarvis.pastoralText, /John 3/i);
      assert.match(otherContract.jarvis.pastoralText, /saved Bible position|My Bible/i);
    } finally {
      await pool.query("DELETE FROM user_bible_data WHERE user_id = ANY($1::text[])", [[ownerId, otherId]]);
    }
  });
});

// ─── Module teardown ──────────────────────────────────────────────────────────
// Idempotent: removes only auth rows this process created (unique per PID nonce),
// so it is safe under concurrent `node --test` files.
after(async () => {
  await cleanupTestAuth();
});
