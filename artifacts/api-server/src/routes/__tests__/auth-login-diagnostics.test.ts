import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSupabaseLoginFailureLog } from "../auth.ts";

describe("Supabase login diagnostics", () => {
  it("contains only redacted diagnostic fields", () => {
    const log = createSupabaseLoginFailureLog({
      route: "/auth/login",
      providerStatus: 401,
      providerCode: "invalid_credentials",
      category: "invalid_credentials",
      correlationId: "req-123",
      existingProductionIdentity: "matched",
      buildId: "build-123",
    });

    assert.deepEqual(Object.keys(log).sort(), [
      "buildId",
      "category",
      "correlationId",
      "event",
      "existingProductionIdentity",
      "providerCode",
      "providerStatus",
      "route",
    ]);
    assert.equal(JSON.stringify(log).includes("password"), false);
    assert.equal(JSON.stringify(log).includes("token"), false);
    assert.equal(JSON.stringify(log).includes("secret"), false);
    assert.equal(JSON.stringify(log).includes("DATABASE_URL"), false);
    assert.equal(JSON.stringify(log).includes("@"), false);
  });
});