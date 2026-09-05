import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContext,
  toEmmausContextInput,
} from "../context-builder.ts";

describe("Emmaus client context compatibility", () => {
  it("ignores browser-supplied identity while preserving the authenticated subject", () => {
    const input = toEmmausContextInput({
      entryPoint: "personal",
      userName: "Impersonated Member",
    }, "verified-member-42");

    assert.equal(input.userId, "verified-member-42");
    assert.equal(input.userName, undefined);
    assert.doesNotMatch(buildContext(input).systemContextBlock, /Impersonated Member/);
  });
});