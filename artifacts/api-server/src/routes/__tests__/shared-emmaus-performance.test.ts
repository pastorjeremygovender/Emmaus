// @ts-nocheck
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("shared Ask Emmaus performance guardrails", () => {
  it("uses a bounded fast model budget and throttled durable writes", async () => {
    const source = await readFile(new URL("../rooms.ts", import.meta.url), "utf8");

    assert.match(source, /SHARED_EMMAUS_MODEL.*gpt-4o-mini/);
    assert.match(source, /SHARED_EMMAUS_MAX_TOKENS = 1400/);
    assert.match(source, /SHARED_EMMAUS_STATE_WRITE_INTERVAL_MS = 750/);
    assert.match(source, /SHARED_EMMAUS_STATE_WRITE_CHARS = 600/);
    assert.match(source, /model: SHARED_EMMAUS_MODEL/);

    const streamSection = source.slice(
      source.indexOf("const iterator = provider.streamCompletion"),
      source.indexOf("await iterator.return?.(undefined as never);", source.indexOf("const iterator = provider.streamCompletion")),
    );
    assert.equal(
      (streamSection.match(/updateSharedEmmausState/g) ?? []).length,
      1,
      "stream persistence should be throttled rather than awaited for every chunk",
    );
  });
});