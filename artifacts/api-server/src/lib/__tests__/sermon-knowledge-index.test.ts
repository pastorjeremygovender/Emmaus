/**
 * sermon-knowledge-index — Integration Tests
 *
 * Exercises the full publish/unpublish/review/delete lifecycle via the store
 * functions that are called directly by every route. All index changes
 * happen atomically inside updateSermonLifecycle (or deleteSermonFully), so
 * these tests verify the actual guarantees exposed to Ask Emmaus / Preached Here.
 *
 * Run:
 *   node --test --import=tsx/esm \
 *     src/lib/__tests__/sermon-knowledge-index.test.ts
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import {
  createSermon,
  publishSermon,
  unpublishSermon,
  updateSermonLifecycle,
  deleteSermonFully,
} from "../canonical-sermon-store.js";
import {
  getKnowledgeIndexDiagnostics,
  reconcileKnowledgeIndex,
  removeFromKnowledgeIndex,
  searchKnowledgeIndex,
} from "../sermon-knowledge-index.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function baseData(title: string) {
  return {
    legacyJsonId:        null,
    title,
    speaker:             "Test Speaker",
    sermonDate:          "2026-01-15",
    series:              "Knowledge-Index Tests",
    scriptureReference:  "John 3:16",
    scriptureBookIds:    ["john"] as string[],
    scriptureChapters:   [3] as number[],
    youtubeUrl:          "",
    youtubeVideoId:      "",
    audioPath:           "",
    notes:               "",
    transcript:          "",
    transcriptStatus:    "none" as const,
    summary:             "Test sermon for knowledge-index lifecycle tests.",
    themes:              ["love"],
    sections:            [],
    keywords:            ["love"],
    mainTheme:           "love",
    status:              "Draft" as const,
    processingStage:     "idle",
    processingError:     "",
  };
}

/** Returns true when the given sermonId appears in a representative index search. */
async function inIndex(sermonId: string): Promise<boolean> {
  const results = await searchKnowledgeIndex("", "john", 3);
  return results.some(r => r.sermonId === sermonId);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

const toCleanup: string[] = [];

after(async () => {
  for (const id of toCleanup) {
    await deleteSermonFully(id).catch(() => {});
    await pool.query(
      "DELETE FROM emmaus_knowledge_index WHERE sermon_id = $1",
      [id],
    ).catch(() => {});
  }
  await pool.end();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Draft sermon is never indexed", () => {
  it("a newly created sermon does not appear in search", async () => {
    const s = await createSermon(baseData("Draft-Never-Indexed"));
    toCleanup.push(s.id);
    assert.equal(await inIndex(s.id), false, "Draft must not appear in index");
  });
});

describe("publishSermon — atomic: status + index in one transaction", () => {
  it("sermon appears in index immediately after publishSermon returns", async () => {
    const s = await createSermon(baseData("Publish-Appear"));
    toCleanup.push(s.id);
    await publishSermon(s.id);
    assert.ok(await inIndex(s.id), "Published sermon must appear in index");
  });
});

describe("unpublishSermon — atomic: status + index removal in one transaction", () => {
  it("sermon is absent from search immediately after unpublishSermon returns", async () => {
    const s = await createSermon(baseData("Unpublish-Disappear"));
    toCleanup.push(s.id);
    await publishSermon(s.id);
    assert.ok(await inIndex(s.id), "should be in index before unpublish");
    await unpublishSermon(s.id);
    assert.equal(await inIndex(s.id), false, "must not appear after unpublishSermon");
  });

  it("republishing after unpublish re-indexes the sermon", async () => {
    const s = await createSermon(baseData("Republish-Cycle"));
    toCleanup.push(s.id);
    await publishSermon(s.id);
    await unpublishSermon(s.id);
    assert.equal(await inIndex(s.id), false, "must be absent after unpublish");
    await publishSermon(s.id);
    assert.ok(await inIndex(s.id), "must be present again after republish");
  });
});

describe("updateSermonLifecycle — all status transitions, single transaction", () => {
  it("Draft → Published: index entry is added", async () => {
    const s = await createSermon(baseData("Lifecycle-Draft-to-Published"));
    toCleanup.push(s.id);
    const now = new Date().toISOString();
    await updateSermonLifecycle(s.id, { status: "Published", publishedAt: now });
    assert.ok(await inIndex(s.id), "Published via lifecycle must be indexed");
  });

  it("Published → Review: index entry is removed (Review ≠ Published)", async () => {
    const s = await createSermon(baseData("Lifecycle-Published-to-Review"));
    toCleanup.push(s.id);
    const now = new Date().toISOString();
    await updateSermonLifecycle(s.id, { status: "Published", publishedAt: now });
    assert.ok(await inIndex(s.id), "should be indexed while Published");
    // Setting status to Review must remove the index entry and persist 'Review' status
    await updateSermonLifecycle(s.id, { status: "Review", publishedAt: null });
    assert.equal(await inIndex(s.id), false, "Review sermon must not appear in index");
    // Confirm DB status is actually 'Review', not silently coerced to 'Draft'
    const { pool: dbPool } = await import("@workspace/db");
    const row = await dbPool.query("SELECT status FROM sermons WHERE id = $1", [s.id]);
    assert.equal(row.rows[0]?.status, "Review", "DB status must be Review, not Draft");
  });

  it("Published → Draft: index entry is removed", async () => {
    const s = await createSermon(baseData("Lifecycle-Published-to-Draft"));
    toCleanup.push(s.id);
    const now = new Date().toISOString();
    await updateSermonLifecycle(s.id, { status: "Published", publishedAt: now });
    await updateSermonLifecycle(s.id, { status: "Draft", publishedAt: null });
    assert.equal(await inIndex(s.id), false, "Draft sermon must not appear in index");
  });

  it("updating metadata on a Published sermon re-indexes updated values", async () => {
    const s = await createSermon(baseData("Lifecycle-Metadata-Update"));
    toCleanup.push(s.id);
    const now = new Date().toISOString();
    await updateSermonLifecycle(s.id, { status: "Published", publishedAt: now });
    // Title update should produce a fresh index entry with the new title
    await updateSermonLifecycle(s.id, { title: "Updated Title For Lifecycle Test" });
    const results = await searchKnowledgeIndex("", "john", 3);
    const entry = results.find(r => r.sermonId === s.id);
    assert.ok(entry, "Updated Published sermon must remain in index");
    assert.equal(entry?.title, "Updated Title For Lifecycle Test", "Index must reflect updated title");
  });

  it("updating metadata on a Draft sermon leaves the index untouched", async () => {
    const s = await createSermon(baseData("Lifecycle-Draft-Metadata"));
    toCleanup.push(s.id);
    await updateSermonLifecycle(s.id, { title: "Draft Metadata Change" });
    assert.equal(await inIndex(s.id), false, "Draft metadata update must not add an index entry");
  });
});

describe("deleteSermonFully — atomic: sermon + index removal in one transaction", () => {
  it("sermon is absent from index immediately after deleteSermonFully returns", async () => {
    const s = await createSermon(baseData("Delete-Disappear"));
    // Don't add to toCleanup — the test itself deletes it
    const now = new Date().toISOString();
    await updateSermonLifecycle(s.id, { status: "Published", publishedAt: now });
    assert.ok(await inIndex(s.id), "must be in index before delete");
    const { deleted } = await deleteSermonFully(s.id);
    assert.ok(deleted, "deleteSermonFully must report success");
    assert.equal(await inIndex(s.id), false, "must not appear in index after delete");
  });
});

describe("removeFromKnowledgeIndex — safety", () => {
  it("removing a non-existent entry does not throw", async () => {
    await assert.doesNotReject(
      () => removeFromKnowledgeIndex("00000000-0000-0000-0000-000000000000"),
      "removeFromKnowledgeIndex must not throw for a missing id",
    );
  });
});

describe("knowledge-index reconciliation", () => {
  it("reports and repairs a missed published row plus an orphan", async () => {
    const s = await createSermon(baseData("Reconciliation-Missed-Published"));
    toCleanup.push(s.id);
    await publishSermon(s.id);
    await removeFromKnowledgeIndex(s.id);

    const before = await getKnowledgeIndexDiagnostics();
    assert.ok(before.missingIndexRows >= 1, "diagnostics must report the missed published row");

    await pool.query(
      `INSERT INTO emmaus_knowledge_index (sermon_id, title, speaker)
       VALUES ('00000000-0000-0000-0000-000000000001', 'Orphaned index row', 'Test Speaker')
       ON CONFLICT (sermon_id) DO NOTHING`,
    );
    const repaired = await reconcileKnowledgeIndex(true);
    assert.equal(repaired.repaired, true);
    assert.ok(repaired.backfilledRows >= 1, "repair must backfill the published sermon");
    assert.ok(repaired.removedRows >= 1, "repair must remove the orphan");
    assert.ok(await inIndex(s.id), "repaired published sermon must be searchable");

    const orphan = await pool.query(
      "SELECT 1 FROM emmaus_knowledge_index WHERE sermon_id = $1",
      ["00000000-0000-0000-0000-000000000001"],
    );
    assert.equal(orphan.rowCount, 0, "orphan must not remain after repair");
  });
});
