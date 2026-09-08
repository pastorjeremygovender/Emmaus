import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVoiceContextEnvelope,
  normalizeVoiceHistory,
} from "../voice-contracts.js";

test("Voice context envelope keeps identity and authority server-owned", () => {
  const envelope = buildVoiceContextEnvelope({
    requestId: "request-1",
    userId: "verified-subject",
    role: "member",
    currentPath: "https://evil.example/steal",
    entryPoint: "not-a-real-entry-point",
    isReading: true,
    lastReadContext: "John 3",
  });

  assert.equal(envelope.verifiedUser.id, "verified-subject");
  assert.equal(envelope.verifiedUser.role, "member");
  assert.equal(envelope.church.id, "icc");
  assert.equal(envelope.location, null);
  assert.equal(envelope.activity.isReading, true);
  assert.equal(envelope.activity.hasJustReadContent, true);
  assert.equal(envelope.authority.routes, "server-generated");
  assert.equal(envelope.authority.safety, "canonical-emmaus");
});

test("Voice context envelope accepts only same-origin application paths", () => {
  const envelope = buildVoiceContextEnvelope({
    requestId: "request-2",
    userId: "user",
    role: "user",
    currentPath: "/bible/read/john/3?from=voice",
    entryPoint: "bible",
  });

  assert.deepEqual(envelope.location, {
    pathname: "/bible/read/john/3?from=voice",
    entryPoint: "bible",
    source: "validated-client-hint",
  });
});

test("Voice history drops malformed entries and bounds message size", () => {
  const history = normalizeVoiceHistory([
    { role: "system", content: "must not pass" },
    { role: "user", content: "  hello  " },
    { role: "assistant", content: "answer" },
    { role: "user", content: 42 },
    ...Array.from({ length: 12 }, (_, index) => ({
      role: "user",
      content: `message-${index}`,
    })),
  ]);

  assert.equal(history.length, 10);
  assert.equal(history[0]?.content, "message-2");
  assert.equal(history.at(-1)?.content, "message-11");
  assert.equal(history.every((item) => item.role === "user" || item.role === "assistant"), true);
});