import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSupabaseErrorCode } from "../supabase-auth.ts";

describe("Supabase Auth error parsing", () => {
  it("preserves the standard GoTrue error when error_code is absent", () => {
    assert.equal(
      getSupabaseErrorCode({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      }),
      "invalid_grant",
    );
  });

  it("prefers Supabase's structured error_code when present", () => {
    assert.equal(
      getSupabaseErrorCode({
        error: "invalid_grant",
        error_code: "email_not_confirmed",
      }),
      "email_not_confirmed",
    );
  });

  it("accepts the connector's code field when error_code is absent", () => {
    assert.equal(
      getSupabaseErrorCode({
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
      "invalid_credentials",
    );
  });

  it("does not turn arbitrary payload values into a logged provider code", () => {
    assert.equal(getSupabaseErrorCode(null), undefined);
    assert.equal(getSupabaseErrorCode({ error: 401 }), undefined);
  });
});