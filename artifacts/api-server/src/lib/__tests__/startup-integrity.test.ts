/**
 * startup-integrity.test.ts — Data-safety integration tests.
 *
 * Guards against two classes of data loss:
 *
 *  1. Migration idempotency — running `runStartupMigrations()` a second time
 *     (simulating a server restart) must leave every authored-content row
 *     byte-for-byte identical. Any INSERT, UPDATE, or DELETE accidentally
 *     added to startup-migrations.ts would be caught here.
 *
 *     Calls the actual `runStartupMigrations()` function (not a
 *     reimplementation) so it stays in sync as new migrations are added.
 *     tsx/esm is the module loader to handle .js→.ts specifier resolution.
 *
 *  2. Seed-script production guards — seed-content.ts and seed-demo.ts must
 *     refuse to run (exit code 1) when NODE_ENV=production and no override
 *     flag is present.
 *
 * Table and column inventory is shared with content-checksum.ts via
 * src/lib/authored-content-tables.ts — update that file to add new tables.
 *
 * Requires DATABASE_URL to be set (runs against the live dev database).
 *
 * Run:
 *   pnpm --filter @workspace/api-server run test:integrity
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "@workspace/db";
// tsx/esm resolves .js → .ts for both of these local imports:
import { runStartupMigrations } from "../startup-migrations.js";
import { AUTHORED_CONTENT_TABLES } from "../authored-content-tables.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "../../scripts");

// ─── Content snapshot ─────────────────────────────────────────────────────────

interface TableChecksum {
  count: number;
  hash: string;
}
type Snapshot = Record<string, TableChecksum>;

/**
 * All rows are included — soft-deleted ones too — so that even hard-deleting
 * a soft-deleted row is detected.
 */
async function captureSnapshot(): Promise<Snapshot> {
  const snap: Snapshot = {};
  for (const t of AUTHORED_CONTENT_TABLES) {
    const countRes = await pool.query(`SELECT COUNT(*) AS n FROM ${t.name}`);
    const count = parseInt(String(countRes.rows[0]?.n ?? "0"), 10);
    const rowRes = await pool.query(
      `SELECT ${t.hashExpr} AS key FROM ${t.name} ORDER BY id`,
    );
    const hash = createHash("sha256")
      .update(rowRes.rows.map((r) => String(r.key ?? "")).join("\n"))
      .digest("hex");
    snap[t.name] = { count, hash };
  }
  return snap;
}

// ─── Test 1: Migration idempotency ───────────────────────────────────────────

describe("Startup migration idempotency", () => {
  let snapBefore: Snapshot;
  let snapAfter: Snapshot;

  before(async () => {
    // The API server already ran runStartupMigrations() on boot.
    // Run it again to simulate a server restart.
    snapBefore = await captureSnapshot();
    await runStartupMigrations();
    snapAfter = await captureSnapshot();
  });

  for (const t of AUTHORED_CONTENT_TABLES) {
    const tableName = t.name;

    it(`${tableName}: row count unchanged after re-migration`, () => {
      assert.equal(
        snapAfter[tableName].count,
        snapBefore[tableName].count,
        `Row count changed in ${tableName}: ` +
          `${snapBefore[tableName].count} → ${snapAfter[tableName].count}. ` +
          `A startup migration added or removed authored content rows. ` +
          `Check startup-migrations.ts for INSERT / DELETE statements.`,
      );
    });

    it(`${tableName}: content hash unchanged after re-migration`, () => {
      assert.equal(
        snapAfter[tableName].hash,
        snapBefore[tableName].hash,
        `Content hash changed in ${tableName}. ` +
          `A startup migration mutated authored content (title or body text). ` +
          `Check startup-migrations.ts for UPDATE statements.`,
      );
    });
  }
});

// ─── Test 2: Seed-script production guards ────────────────────────────────────

describe("Seed script production guards", () => {
  /**
   * Production env without the override flag.
   * DATABASE_URL is forwarded so @workspace/db can load without throwing
   * (pg.Pool is lazy — no connection until first query, which never happens
   * because process.exit(1) fires before any query executes).
   */
  const prodEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    ALLOW_SEED_IN_PRODUCTION: "",
  };

  it("seed-content.ts exits 1 with NODE_ENV=production", () => {
    const result = spawnSync(
      "node",
      ["--experimental-strip-types", join(SCRIPTS_DIR, "seed-content.ts")],
      { encoding: "utf8", env: prodEnv, timeout: 15_000 },
    );
    assert.equal(
      result.status,
      1,
      `seed-content.ts should exit 1 in production mode (got ${result.status}). ` +
        `stderr: ${result.stderr}`,
    );
    const output = (result.stderr ?? "") + (result.stdout ?? "");
    assert.match(
      output,
      /production/i,
      "Output must mention 'production' — production guard message missing from seed-content.ts",
    );
  });

  it("seed-demo.ts exits 1 with NODE_ENV=production", () => {
    const result = spawnSync(
      "node",
      ["--experimental-strip-types", join(SCRIPTS_DIR, "seed-demo.ts")],
      { encoding: "utf8", env: prodEnv, timeout: 15_000 },
    );
    assert.equal(
      result.status,
      1,
      `seed-demo.ts should exit 1 in production mode (got ${result.status}). ` +
        `stderr: ${result.stderr}`,
    );
    const output = (result.stderr ?? "") + (result.stdout ?? "");
    assert.match(
      output,
      /production/i,
      "Output must mention 'production' — production guard message missing from seed-demo.ts",
    );
  });
});

// ─── Test 3: No __TEST__ records in user-facing tables ───────────────────────
// Test-only records (title starting with __TEST__) must never appear in
// production-facing tables.  This guard fires in dev so the violation is caught
// before export:seed ever runs, meaning it can never reach the production DB.

describe("No __TEST__ records in user-facing tables", () => {
  it("devotional_series has no __TEST__ titles", async () => {
    const { rows } = await pool.query<{ title: string }>(
      `SELECT title FROM devotional_series WHERE title LIKE '__TEST__%' LIMIT 5`,
    );
    assert.equal(
      rows.length,
      0,
      `Found ${rows.length} __TEST__ devotional series: ${rows.map((r) => r.title).join(", ")}. ` +
        "Delete test records from the dev database before publishing.",
    );
  });

  it("journeys has no __TEST__ titles", async () => {
    const { rows } = await pool.query<{ title: string }>(
      `SELECT title FROM journeys WHERE title LIKE '__TEST__%' AND deleted_at IS NULL LIMIT 5`,
    );
    assert.equal(
      rows.length,
      0,
      `Found ${rows.length} __TEST__ journeys: ${rows.map((r) => r.title).join(", ")}. ` +
        "Delete test records from the dev database before publishing.",
    );
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end().catch(() => {});
});
