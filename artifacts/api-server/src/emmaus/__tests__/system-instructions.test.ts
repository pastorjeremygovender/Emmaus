// @ts-nocheck
/**
 * system-instructions.ts — Unit Tests
 *
 * Verifies buildSystemPrompt behaviour around the userName personalisation
 * block. These are pure function tests — no network or filesystem access.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/emmaus/__tests__/system-instructions.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// .ts extension required for --experimental-strip-types
import { buildSystemPrompt } from "../system-instructions.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTEXT_BLOCK = "Entry point: standalone";

// The sentinel text that appears only when a name is provided
const NAME_GUIDANCE_SENTINEL = "MEMBER'S NAME:";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildSystemPrompt — userName personalisation", () => {
  it("includes the name guidance block when userName is a non-empty string", () => {
    const prompt = buildSystemPrompt(CONTEXT_BLOCK, "Sarah");

    assert.ok(
      prompt.includes(NAME_GUIDANCE_SENTINEL),
      `Expected "${NAME_GUIDANCE_SENTINEL}" to appear in the prompt when a name is provided`
    );
    assert.ok(
      prompt.includes("Sarah"),
      `Expected the member's name "Sarah" to appear in the prompt`
    );
  });

  it("omits the name guidance block when userName is undefined", () => {
    const prompt = buildSystemPrompt(CONTEXT_BLOCK, undefined);

    assert.ok(
      !prompt.includes(NAME_GUIDANCE_SENTINEL),
      `Expected "${NAME_GUIDANCE_SENTINEL}" NOT to appear when userName is undefined`
    );
  });

  it("omits the name guidance block when userName is an empty string", () => {
    const prompt = buildSystemPrompt(CONTEXT_BLOCK, "");

    assert.ok(
      !prompt.includes(NAME_GUIDANCE_SENTINEL),
      `Expected "${NAME_GUIDANCE_SENTINEL}" NOT to appear when userName is an empty string`
    );
  });

  it("includes the name guidance block when userName is a whitespace-only string (caller is responsible for trimming)", () => {
    // buildSystemPrompt checks truthiness only — a whitespace-only string is
    // truthy, so the block IS included. The caller (conversation-service.ts)
    // is responsible for trimming and converting whitespace-only values to
    // undefined before calling buildSystemPrompt.
    const prompt = buildSystemPrompt(CONTEXT_BLOCK, "   ");

    assert.ok(
      prompt.includes(NAME_GUIDANCE_SENTINEL),
      `Expected "${NAME_GUIDANCE_SENTINEL}" to appear when userName is a whitespace-only string (truthy value)`
    );
  });

  it("the name guidance block is absent from an unnamed prompt but the system core is still present", () => {
    const promptNoName = buildSystemPrompt(CONTEXT_BLOCK);
    const promptWithName = buildSystemPrompt(CONTEXT_BLOCK, "James");

    // Core identity content always present regardless of name
    assert.ok(
      promptNoName.includes("You are Emmaus"),
      "Core identity text must appear even without a name"
    );
    assert.ok(
      promptWithName.includes("You are Emmaus"),
      "Core identity text must appear when a name is present"
    );

    // The name block is the only difference between the two
    assert.ok(
      promptWithName.length > promptNoName.length,
      "Named prompt must be longer than unnamed prompt"
    );
  });

  it("context block is always injected regardless of userName", () => {
    const customContext = "Entry point: bible | Book: John | Chapter: 3";

    const promptNoName = buildSystemPrompt(customContext);
    const promptWithName = buildSystemPrompt(customContext, "Luke");

    assert.ok(
      promptNoName.includes(customContext),
      "Context block must appear when no name is provided"
    );
    assert.ok(
      promptWithName.includes(customContext),
      "Context block must appear when a name is provided"
    );
  });

  it("requires verified sermon context to be referenced in the written response", () => {
    const prompt = buildSystemPrompt(
      `${CONTEXT_BLOCK}\n\nVerified ICC sermon matching this conversation:\n  Title: "When the Pressure Builds"\n  Speaker: Pastor Jeremy`,
    );

    assert.match(prompt, /MUST include at least one\s+natural sentence/i);
    assert.match(prompt, /not merely leave the sermon for the link\/card/i);
    assert.match(prompt, /When the Pressure Builds/);
  });

  it("equips Emmaus to use the full published resource library", () => {
    const prompt = buildSystemPrompt(CONTEXT_BLOCK);

    for (const resource of [
      "Daily Rhythm",
      "Walks",
      "Journeys",
      "Bible Studies",
      "Devotionals",
      "Sermon Companions",
    ]) {
      assert.match(prompt, new RegExp(resource), `Expected ${resource} guidance`);
    }
    assert.match(prompt, /approved excerpts/i);
    assert.match(prompt, /exact title and route|title,\s+route, and supplied content/i);
    assert.match(prompt, /Scripture remains the centre/i);
  });
});

// ─── conversation-service wiring note ────────────────────────────────────────
//
// conversation-service.ts line ~334:
//   const systemPrompt = buildSystemPrompt(
//     contextBlock,
//     contextInput.userName?.trim() || undefined
//   );
//
// This already ensures:
//   • contextInput.userName is trimmed before being passed through.
//   • An empty/whitespace-only string becomes undefined, so the name block
//     is correctly suppressed for members who have not set a preferred name.
// The integration path is exercised by the streaming integration tests
// (src/emmaus/__tests__/streaming.test.ts) which hit the live service.
