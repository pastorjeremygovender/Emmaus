/**
 * Reconcile the Ask Emmaus sermon knowledge index against canonical Published
 * sermons. The operation is idempotent and refuses to run in production unless
 * explicitly enabled, because it mutates indexed search data.
 */
import { reconcileKnowledgeIndex } from "../lib/sermon-knowledge-index.ts";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_INDEX_REPAIR_IN_PRODUCTION !== "true") {
  console.error("[repair-knowledge-index] BLOCKED: NODE_ENV=production detected.");
  console.error("[repair-knowledge-index] Use the authenticated admin endpoint, or set ALLOW_INDEX_REPAIR_IN_PRODUCTION=true.");
  process.exit(1);
}

async function main(): Promise<void> {
  const result = await reconcileKnowledgeIndex(true);
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error("[repair-knowledge-index] failed:", error);
  process.exitCode = 1;
});