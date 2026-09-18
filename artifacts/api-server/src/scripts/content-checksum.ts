/**
 * content-checksum.ts — Snapshot counts and SHA-256 hashes for all authored
 * content tables.
 *
 * Run before and after a deployment to prove zero unintended mutations:
 *
 *   pnpm --filter @workspace/api-server run checksum:content > before.json
 *   # ... deploy ...
 *   pnpm --filter @workspace/api-server run checksum:content > after.json
 *   diff before.json after.json
 *
 * A clean diff (empty output) means the deployment mutated no authored rows.
 * The timestamp is printed to stderr so it never appears in the diffable JSON.
 *
 * Table and column inventory is shared with the startup-integrity test via
 * src/lib/authored-content-tables.ts — update that file to add new tables.
 */

import { pool } from "@workspace/db";
import { createHash } from "node:crypto";
// .ts extension used so --experimental-strip-types can resolve this local file
import { AUTHORED_CONTENT_TABLES } from "../lib/authored-content-tables.ts";

interface TableChecksum {
  count: number;
  hash: string;
}

type ContentSnapshot = {
  tables: Record<string, TableChecksum>;
};

async function checksumTable(
  tableName: string,
  hashExpr: string,
): Promise<TableChecksum> {
  const countRes = await pool.query(
    `SELECT COUNT(*) AS n FROM ${tableName}`,
  );
  const count = parseInt(String(countRes.rows[0]?.n ?? "0"), 10);

  const rowRes = await pool.query(
    `SELECT ${hashExpr} AS key FROM ${tableName} ORDER BY id`,
  );

  const hash = createHash("sha256")
    .update(rowRes.rows.map((r) => String(r.key ?? "")).join("\n"))
    .digest("hex");

  return { count, hash };
}

async function main() {
  const tables: Record<string, TableChecksum> = {};

  for (const t of AUTHORED_CONTENT_TABLES) {
    tables[t.name] = await checksumTable(t.name, t.hashExpr);
  }

  const snapshot: ContentSnapshot = { tables };

  // Timestamp goes to stderr — keeps stdout purely diffable.
  process.stderr.write(
    `[content-checksum] Generated at ${new Date().toISOString()}\n`,
  );
  console.log(JSON.stringify(snapshot, null, 2));
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[content-checksum] Error:", (err as Error).message);
  process.exit(1);
});
