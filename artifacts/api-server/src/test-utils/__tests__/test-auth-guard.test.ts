/**
 * test-auth-guard.test.ts
 *
 * Verifies the environment guard on the integration-test auth harness. The
 * harness must refuse to run unless BOTH an explicit opt-in flag
 * (ALLOW_TEST_AUTH_HARNESS=1) AND NODE_ENV=test are present, and must always
 * reject production / live deployments. Crucially it must NOT activate merely
 * because NODE_ENV is unset or "development".
 *
 * Each check runs `guardEnv` directly in a fresh
 * child process with a controlled environment. Using a child process keeps env
 * mutation isolated from the parent test runner. No case touches the database.
 *
 * Run:
 *   node --test --experimental-strip-types \
 *     src/test-utils/__tests__/test-auth-guard.test.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const harnessUrl = new URL("../test-auth.ts", import.meta.url);
const harnessPath = fileURLToPath(harnessUrl);

/**
 * Run guardEnv() in a child with the given env overrides. This validates both
 * accepted and rejected environments without creating a user or session row.
 */
function runGuard(env: Record<string, string | undefined>): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const script = `
    import { guardEnv } from ${JSON.stringify(harnessPath)};
    try {
      guardEnv();
      console.log("GUARD_PASSED");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("test-auth harness refused to run")) {
        console.log("GUARD_REJECTED::" + msg);
      } else {
        console.log("UNEXPECTED_ERROR::" + msg);
      }
    }
  `;
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { env: childEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { code: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("test-auth guardEnv", () => {
  it("rejects when the allow flag is absent (even with NODE_ENV=test)", () => {
    const { stdout } = runGuard({
      NODE_ENV: "test",
      ALLOW_TEST_AUTH_HARNESS: undefined,
      REPLIT_DEPLOYMENT: undefined,
    });
    assert.match(stdout, /GUARD_REJECTED/);
    assert.match(stdout, /ALLOW_TEST_AUTH_HARNESS is not set/);
  });

  it("rejects when NODE_ENV is unset (never runs implicitly)", () => {
    const { stdout } = runGuard({
      NODE_ENV: undefined,
      ALLOW_TEST_AUTH_HARNESS: "1",
      REPLIT_DEPLOYMENT: undefined,
    });
    assert.match(stdout, /GUARD_REJECTED/);
    assert.match(stdout, /NODE_ENV must be 'test'/);
  });

  it("rejects when NODE_ENV=development (never runs implicitly)", () => {
    const { stdout } = runGuard({
      NODE_ENV: "development",
      ALLOW_TEST_AUTH_HARNESS: "1",
      REPLIT_DEPLOYMENT: undefined,
    });
    assert.match(stdout, /GUARD_REJECTED/);
    assert.match(stdout, /NODE_ENV must be 'test'/);
  });

  it("rejects production regardless of the allow flag", () => {
    const { stdout } = runGuard({
      NODE_ENV: "production",
      ALLOW_TEST_AUTH_HARNESS: "1",
      REPLIT_DEPLOYMENT: undefined,
    });
    assert.match(stdout, /GUARD_REJECTED/);
    assert.match(stdout, /NODE_ENV=production/);
  });

  it("rejects a live Replit deployment even with both test flags", () => {
    const { stdout } = runGuard({
      NODE_ENV: "test",
      ALLOW_TEST_AUTH_HARNESS: "1",
      REPLIT_DEPLOYMENT: "1",
    });
    assert.match(stdout, /GUARD_REJECTED/);
    assert.match(stdout, /REPLIT_DEPLOYMENT is set/);
  });

  it("passes the guard only when the allow flag AND NODE_ENV=test are set", () => {
    const { stdout } = runGuard({
      NODE_ENV: "test",
      ALLOW_TEST_AUTH_HARNESS: "1",
      REPLIT_DEPLOYMENT: undefined,
    });
    assert.doesNotMatch(stdout, /GUARD_REJECTED/);
    assert.match(stdout, /GUARD_PASSED/);
  });
});
