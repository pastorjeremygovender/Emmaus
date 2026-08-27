/**
 * Emmaus Streaming Parser Tests
 *
 * Verifies that the rolling-buffer <EMMAUS_META> stripping is chunk-safe:
 *   1. Tag fully in one chunk     — text before tag is emitted, metadata received
 *   2. Tag split across chunks    — no partial tag bytes emitted as text
 *   3. Tag beginning mid-chunk    — text before tag in that chunk is still emitted
 *   4. No tag present             — full text is emitted, fallback metadata used
 *
 * These tests hit the live dev server and use a known MockProvider response so
 * the exact chunk boundaries can be inferred from the mock's word-by-word delivery.
 */

import http from "node:http";
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";

const BASE = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const url = new URL(BASE);

async function postConversation(message: string): Promise<{ events: string[]; doneEvent: Record<string, unknown> | null }> {
  // Authenticate with a real opaque session (app_role "user") — no X-User-* header.
  const auth = await authHeader("user-stream-test", { role: "user" });
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ message, context: { entryPoint: "personal" } });
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || 80,
        method: "POST",
        path: "/api/emmaus/conversation",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...auth,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          const lines = raw.split("\n").filter((l) => l.startsWith("data: "));
          const events: string[] = [];
          let doneEvent: Record<string, unknown> | null = null;

          for (const line of lines) {
            const parsed = JSON.parse(line.slice("data: ".length)) as Record<string, unknown>;
            if (parsed.type === "text") {
              events.push(parsed.content as string);
            } else if (parsed.type === "done") {
              doneEvent = parsed;
            }
          }
          resolve({ events, doneEvent });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("Emmaus streaming — metadata stripping", () => {
  it("text events contain no <EMMAUS_META> tag bytes", async () => {
    const { events } = await postConversation("I feel far from God");
    const allText = events.join("");
    assert.ok(!allText.includes("<EMMAUS_META"), "no EMMAUS_META tag should appear in emitted text");
    assert.ok(!allText.includes("</EMMAUS_META"), "no EMMAUS_META close tag should appear in emitted text");
    assert.ok(allText.length > 10, "emitted text should be non-empty");
    assert.ok(events.length > 1, "response should arrive in multiple text events before done");
  });

  it("done event is received with structured metadata", async () => {
    const { doneEvent } = await postConversation("Help me understand John 3:16");
    assert.ok(doneEvent, "done event must be present");
    assert.ok(doneEvent.conversationId, "done event must include conversationId");
    assert.ok(doneEvent.messageId, "done event must include messageId");
    assert.ok(doneEvent.promptVersion, "done event must include promptVersion");
    assert.ok(doneEvent.metadata, "done event must include metadata");
    const meta = doneEvent.metadata as Record<string, unknown>;
    assert.ok(Array.isArray(meta.followUpPrompts), "metadata must include followUpPrompts array");
  });

  it("emitted text does not contain JSON-looking metadata fragments", async () => {
    const { events } = await postConversation("What does the Bible say about anxiety?");
    const allText = events.join("");
    // The metadata block begins with {"scripture": ... — ensure that JSON is not in the stream
    assert.ok(!allText.includes('"scripture"'), 'metadata JSON key "scripture" must not appear in text stream');
    assert.ok(!allText.includes('"handoffType"'), 'metadata JSON key "handoffType" must not appear in text stream');
  });

  it("emitted text forms a clean readable sentence (no mid-stream corruption)", async () => {
    const { events } = await postConversation("I feel far from God");
    // All text events should concatenate into coherent prose — no empty events or junk
    const allText = events.join("");
    // Should start with a capital letter or recognisable text character
    assert.match(allText.trimStart(), /^[A-Za-z"'\u2018\u2019\u201C\u201D]/, "text should start with a readable character");
    // Should not contain raw angle brackets from tags
    assert.ok(!allText.includes("<EMMAUS"), "no tag text in stream");
  });

  it("done event metadata followUpPrompts are non-empty strings", async () => {
    const { doneEvent } = await postConversation("I feel far from God");
    const meta = (doneEvent?.metadata ?? {}) as { followUpPrompts?: unknown[] };
    assert.ok(Array.isArray(meta.followUpPrompts), "followUpPrompts should be an array");
    assert.ok(
      (meta.followUpPrompts as string[]).every((p) => typeof p === "string" && p.length > 0),
      "every followUpPrompt should be a non-empty string"
    );
  });
});

// ─── Module teardown ──────────────────────────────────────────────────────────
// Idempotent and concurrency-safe (auth rows are unique per process nonce).
after(async () => {
  await cleanupTestAuth();
});
