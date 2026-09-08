import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { PUBLISHED_STUDY_NOTE_FOR_VERSE_SQL } from "../bible-bulk-import-store.js";
import { CHAPTER_OVERVIEW_SEED_INSERT_SQL } from "../prod-data-sync.js";

after(async () => {
  await pool.end();
});

describe("Bible Study importer database safety", () => {
  test("production seed insert never overwrites an authored overview", async () => {
    const client = await pool.connect();
    const bookId = `import-test-${randomUUID()}`;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO bible_chapter_overviews
           (book_id, chapter, title, summary, status, created_by, updated_by)
         VALUES ($1, 1, 'Imported title', 'Imported summary', 'Draft', 'admin', 'admin')`,
        [bookId],
      );

      await client.query(CHAPTER_OVERVIEW_SEED_INSERT_SQL, [
        randomUUID(),
        bookId,
        1,
        "Seed title",
        "Seed summary",
        "[]",
        "[]",
        "[]",
        "[]",
        "Seed verse",
        1,
        2,
        "Seed connection",
        "Seed Jesus connection",
        "Published",
        "seed",
        "seed",
      ]);

      const result = await client.query<{
        title: string;
        summary: string;
        status: string;
        updated_by: string;
      }>(
        `SELECT title, summary, status, updated_by
           FROM bible_chapter_overviews
          WHERE book_id = $1 AND chapter = 1`,
        [bookId],
      );
      assert.deepEqual(result.rows[0], {
        title: "Imported title",
        summary: "Imported summary",
        status: "Draft",
        updated_by: "admin",
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("member range lookup returns the most specific matching Study record", async () => {
    const client = await pool.connect();
    const bookId = `range-test-${randomUUID()}`;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO bible_study_notes
           (book_id, chapter, verse_start, verse_end, content, status)
         VALUES
           ($1, 1, 1, 10, 'Broad range', 'Published'),
           ($1, 1, 3, 5, 'Specific range', 'Published')`,
        [bookId],
      );

      const result = await client.query<{ content: string }>(
        PUBLISHED_STUDY_NOTE_FOR_VERSE_SQL,
        [bookId, 1, 4],
      );
      assert.equal(result.rows[0]?.content, "Specific range");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});