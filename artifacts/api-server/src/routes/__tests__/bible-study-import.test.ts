import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import { pool } from "@workspace/db";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";

if (
  process.env.NODE_ENV !== "test" ||
  process.env.ALLOW_TEST_AUTH_HARNESS !== "1" ||
  process.env.REPLIT_DEPLOYMENT
) {
  throw new Error(
    "bible-study-import.test must run only with the explicit test auth harness",
  );
}

let server: http.Server;
let baseUrl: string;
let adminHeaders: Record<string, string>;
let memberHeaders: Record<string, string>;
let testBookId = "";
let testBookName = "";
const importIds: string[] = [];

const candidates = [
  { bookId: "obadiah", bookName: "Obadiah" },
  { bookId: "philemon", bookName: "Philemon" },
  { bookId: "2john", bookName: "2 John" },
  { bookId: "3john", bookName: "3 John" },
  { bookId: "jude", bookName: "Jude" },
];

function importText(explanation: string): string {
  return `
BOOK: ${testBookName}
CHAPTER: 1
TITLE: Import API Test Chapter
CHAPTER_OVERVIEW: A test-only overview that is removed after this suite.

PASSAGE: ${testBookName} 1:1
EXPLANATION: ${explanation}
PASSAGE_CONTEXT: Test context
ORIGINAL_LANGUAGE_NOTE: Displayed-format language note
KEY_TRUTH: Test truth
REFLECTION_QUESTION: Test question?
RELATED_SCRIPTURES: John 1:1
`.trim();
}

async function post(path: string, body: unknown, headers = adminHeaders) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function get(path: string, headers = adminHeaders) {
  return fetch(`${baseUrl}${path}`, { headers });
}

before(async () => {
  const [{ default: express }, { authMiddleware }, { default: bibleRouter }] =
    await Promise.all([
      import("express"),
      import("../../middlewares/authMiddleware.ts"),
      import("../bible.ts"),
    ]);

  for (const candidate of candidates) {
    const existing = await pool.query<{ count: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM bible_chapter_overviews WHERE book_id = $1 AND chapter = 1) +
         (SELECT COUNT(*) FROM bible_study_notes WHERE book_id = $1 AND chapter = 1)
       )::text AS count`,
      [candidate.bookId],
    );
    if (Number(existing.rows[0].count) === 0) {
      testBookId = candidate.bookId;
      testBookName = candidate.bookName;
      break;
    }
  }
  assert.ok(testBookId, "a test-safe empty canonical Bible chapter is required");

  adminHeaders = await authHeader("bible-import-admin", { role: "superAdmin" });
  memberHeaders = await authHeader("bible-import-member");

  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use(authMiddleware);
  app.use("/api", bibleRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  if (testBookId) {
    await pool.query(
      "DELETE FROM bible_study_notes WHERE book_id = $1 AND chapter = 1",
      [testBookId],
    );
    await pool.query(
      "DELETE FROM bible_chapter_overviews WHERE book_id = $1 AND chapter = 1",
      [testBookId],
    );
  }
  if (importIds.length > 0) {
    await pool.query(
      "DELETE FROM content_audit_log WHERE content_type = 'bible_bulk_import' AND split_part(content_id, ':', 1) = ANY($1::text[])",
      [importIds],
    );
    await pool.query(
      "DELETE FROM bible_study_import_history WHERE id = ANY($1::uuid[])",
      [importIds],
    );
  }
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await cleanupTestAuth();
});

describe("Bulk Bible Study Import API", () => {
  it("keeps the admin book-intro collection route ahead of the dynamic member route", async () => {
    const response = await get("/api/bible/book-intro/admin");
    assert.equal(response.status, 200);
    const body = (await response.json()) as unknown;
    assert.ok(Array.isArray(body));
  });

  it("requires a real authenticated admin role", async () => {
    const anonymous = await post(
      "/api/bible/study-import/preview",
      { text: importText("Anonymous") },
      {},
    );
    assert.equal(anonymous.status, 401);

    const member = await post(
      "/api/bible/study-import/preview",
      { text: importText("Member") },
      memberHeaders,
    );
    assert.equal(member.status, 403);
  });

  it("previews valid content without writing history or Study rows", async () => {
    const beforeHistory = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM bible_study_import_history",
    );
    const response = await post("/api/bible/study-import/preview", {
      text: importText("Preview only"),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      valid: boolean;
      totalPassages: number;
      fieldCounts: Record<string, number>;
      books: Array<{ bookId: string; chapters: Array<{ key: string }> }>;
      conflicts: { existingPassages: number; existingOverviews: number };
    };
    assert.equal(body.valid, true);
    assert.equal(body.totalPassages, 1);
    assert.equal(body.fieldCounts.content, 1);
    assert.equal(body.books[0].bookId, testBookId);
    assert.equal(body.books[0].chapters[0].key, `${testBookId}:1`);
    assert.deepEqual(body.conflicts, {
      existingOverviews: 0,
      existingPassages: 0,
      publishedRecords: 0,
    });

    const afterHistory = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM bible_study_import_history",
    );
    assert.equal(afterHistory.rows[0].count, beforeHistory.rows[0].count);
    const rows = await pool.query<{ count: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM bible_chapter_overviews WHERE book_id = $1 AND chapter = 1) +
         (SELECT COUNT(*) FROM bible_study_notes WHERE book_id = $1 AND chapter = 1)
       )::text AS count`,
      [testBookId],
    );
    assert.equal(rows.rows[0].count, "0");
  });

  it("rejects overlapping incoming ranges before creating import history", async () => {
    const response = await post("/api/bible/study-import", {
      text: `${importText("First range").replace(
        `PASSAGE: ${testBookName} 1:1`,
        `PASSAGE: ${testBookName} 1:1-3`,
      )}\nPASSAGE: ${testBookName} 1:2-4\nEXPLANATION: Overlap`,
      selectedChapterKeys: [`${testBookId}:1`],
      mode: "skip",
      targetStatus: "Draft",
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      preview: { errors: Array<{ code: string }> };
    };
    assert.ok(
      body.preview.errors.some(
        (error) => error.code === "OVERLAPPING_PASSAGE_RANGE",
      ),
    );

    const repeatedChapterResponse = await post("/api/bible/study-import", {
      text: `${importText("First chapter block")}
BOOK: ${testBookName}
CHAPTER: 1
PASSAGE: ${testBookName} 1:1-3
EXPLANATION: Repeated chapter block`,
      selectedChapterKeys: [`${testBookId}:1`],
      mode: "replace",
      targetStatus: "Draft",
    });
    assert.equal(repeatedChapterResponse.status, 400);
    const repeatedChapterBody = (await repeatedChapterResponse.json()) as {
      preview: { errors: Array<{ code: string }> };
    };
    const repeatedCodes = repeatedChapterBody.preview.errors.map(
      (error) => error.code,
    );
    assert.ok(repeatedCodes.includes("DUPLICATE_CHAPTER"));
    assert.ok(repeatedCodes.includes("OVERLAPPING_PASSAGE_RANGE"));
  });

  it("imports Draft content, preserves unrelated metadata on Replace, publishes, and exposes the range to members", async () => {
    const draftResponse = await post("/api/bible/study-import", {
      text: importText("Draft explanation"),
      selectedChapterKeys: [`${testBookId}:1`],
      mode: "skip",
      targetStatus: "Draft",
    });
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json()) as {
      importId: string;
      status: string;
      counts: { created: number };
    };
    importIds.push(draft.importId);
    assert.equal(draft.status, "Completed");
    assert.equal(draft.counts.created, 2);

    await pool.query(
      `UPDATE bible_study_notes
          SET cross_references = '["preserve-cross-reference"]'::jsonb,
              key_themes = '["preserve-theme"]'::jsonb
        WHERE book_id = $1 AND chapter = 1`,
      [testBookId],
    );
    await pool.query(
      `UPDATE bible_chapter_overviews
          SET main_themes = '["preserve-overview-theme"]'::jsonb,
              key_verse = 'Preserve this key verse'
        WHERE book_id = $1 AND chapter = 1`,
      [testBookId],
    );

    const replaceResponse = await post("/api/bible/study-import", {
      text: importText("Replacement explanation"),
      selectedChapterKeys: [`${testBookId}:1`],
      mode: "replace",
      targetStatus: "Draft",
    });
    assert.equal(replaceResponse.status, 201);
    const replace = (await replaceResponse.json()) as {
      importId: string;
      counts: { replaced: number };
    };
    importIds.push(replace.importId);
    assert.equal(replace.counts.replaced, 2);

    const preserved = await pool.query<{
      content: string;
      original_language_note: string;
      cross_references: unknown;
      key_themes: unknown;
      main_themes: unknown;
      key_verse: string;
      note_status: string;
      overview_status: string;
    }>(
      `SELECT n.content, n.original_language_note, n.cross_references, n.key_themes,
              o.main_themes, o.key_verse,
              n.status AS note_status, o.status AS overview_status
         FROM bible_study_notes n
         JOIN bible_chapter_overviews o
           ON o.book_id = n.book_id AND o.chapter = n.chapter
        WHERE n.book_id = $1 AND n.chapter = 1`,
      [testBookId],
    );
    assert.equal(preserved.rows[0].content, "Replacement explanation");
    assert.equal(
      preserved.rows[0].original_language_note,
      "Displayed-format language note",
    );
    assert.deepEqual(preserved.rows[0].cross_references, [
      "preserve-cross-reference",
    ]);
    assert.deepEqual(preserved.rows[0].key_themes, ["preserve-theme"]);
    assert.deepEqual(preserved.rows[0].main_themes, [
      "preserve-overview-theme",
    ]);
    assert.equal(preserved.rows[0].key_verse, "Preserve this key verse");
    assert.equal(preserved.rows[0].note_status, "Draft");
    assert.equal(preserved.rows[0].overview_status, "Draft");

    const publishResponse = await post("/api/bible/study-import", {
      text: importText("Published explanation"),
      selectedChapterKeys: [`${testBookId}:1`],
      mode: "replace",
      targetStatus: "Published",
    });
    assert.equal(publishResponse.status, 201);
    const publish = (await publishResponse.json()) as {
      importId: string;
      counts: { published: number };
    };
    importIds.push(publish.importId);
    assert.equal(publish.counts.published, 2);

    const memberResponse = await fetch(
      `${baseUrl}/api/bible/study-notes?bookId=${testBookId}&chapter=1&verse=1`,
    );
    assert.equal(memberResponse.status, 200);
    const memberNote = (await memberResponse.json()) as {
      content: string;
      status: string;
    };
    assert.equal(memberNote.content, "Published explanation");
    assert.equal(memberNote.status, "Published");

    const historyResponse = await fetch(
      `${baseUrl}/api/bible/study-import/history`,
      { headers: adminHeaders },
    );
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()) as {
      history: Array<{ id: string; status: string }>;
    };
    assert.ok(
      history.history.some(
        (entry) => entry.id === publish.importId && entry.status === "Completed",
      ),
    );

    const audit = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM content_audit_log
        WHERE content_type = 'bible_bulk_import'
          AND split_part(content_id, ':', 1) = ANY($1::text[])`,
      [importIds],
    );
    assert.equal(Number(audit.rows[0].count), importIds.length);
  });
});