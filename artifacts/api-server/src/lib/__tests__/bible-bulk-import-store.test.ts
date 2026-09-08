import test, { describe } from "node:test";
import assert from "node:assert/strict";
import type { ParsedChapter } from "../bible-bulk-import.js";
import {
  hasPassageStudyContent,
  importBibleStudyChapter,
  resolveImportedStatus,
  withChapterTransaction,
  type TransactionClient,
} from "../bible-bulk-import-store.js";

type QueryRecord = { text: string; values?: unknown[] };

class FakeClient implements TransactionClient {
  queries: QueryRecord[] = [];
  overview: Record<string, unknown> | null = null;
  passages = new Map<number, Record<string, unknown>>();
  failOn: RegExp | null = null;

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const normalized = text.replace(/\s+/g, " ").trim();
    this.queries.push({ text: normalized, values });
    if (this.failOn?.test(normalized)) throw new Error("simulated write failure");

    if (normalized.startsWith("SELECT id, title, summary, status")) {
      return {
        rows: (this.overview ? [this.overview] : []) as T[],
        rowCount: this.overview ? 1 : 0,
      };
    }
    if (normalized.startsWith("SELECT id, status, verse_start, verse_end FROM bible_study_notes")) {
      const verseStart = Number(values?.[2]);
      const verseEnd = Number(values?.[3]);
      const matchingPassages = [...this.passages.values()].filter((passage) => {
        const existingStart = Number(passage.verse_start);
        const existingEnd = Number(passage.verse_end ?? passage.verse_start);
        return existingStart <= verseEnd && existingEnd >= verseStart;
      });
      return {
        rows: matchingPassages as T[],
        rowCount: matchingPassages.length,
      };
    }
    return { rows: [], rowCount: 1 };
  }
}

function chapter(fields: Record<string, string> = { content: "Explanation" }): ParsedChapter {
  return {
    chapterNumber: 1,
    title: "The beginning",
    chapterOverview: "A chapter overview",
    valid: true,
    lineNumber: 2,
    passages: [
      {
        verseStart: 1,
        verseEnd: 5,
        referenceRaw: "John 1:1-5",
        fields,
        valid: true,
        lineNumber: 5,
      },
    ],
  };
}

describe("Bible Study import store primitives", () => {
  test("does not create a blank passage placeholder", () => {
    assert.equal(hasPassageStudyContent({}), false);
    assert.equal(hasPassageStudyContent({ content: "  " }), false);
    assert.equal(hasPassageStudyContent({ key_truth: "Jesus is Lord" }), true);
  });

  test("merge to Draft never silently unpublishes existing content", () => {
    assert.equal(resolveImportedStatus("Published", "merge", "Draft"), "Published");
    assert.equal(resolveImportedStatus("Published", "replace", "Draft"), "Draft");
    assert.equal(resolveImportedStatus("Draft", "merge", "Published"), "Published");
  });

  test("commits a successful chapter transaction", async () => {
    const client = new FakeClient();
    const value = await withChapterTransaction(client, async () => "ok");
    assert.equal(value, "ok");
    assert.deepEqual(client.queries.map((query) => query.text), ["BEGIN", "COMMIT"]);
  });

  test("rolls back a failed chapter transaction", async () => {
    const client = new FakeClient();
    await assert.rejects(
      withChapterTransaction(client, async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.deepEqual(client.queries.map((query) => query.text), ["BEGIN", "ROLLBACK"]);
  });
});

describe("Bible Study chapter import modes", () => {
  test("Skip Existing leaves overview and passage content unchanged", async () => {
    const client = new FakeClient();
    client.overview = { id: "overview-1", title: "Existing", summary: "Existing", status: "Published" };
    client.passages.set(1, {
      id: "note-1",
      status: "Published",
      verse_start: 1,
      verse_end: 5,
    });

    const result = await importBibleStudyChapter(
      client,
      "john",
      chapter(),
      "import-1",
      "admin-1",
      "skip",
      "Draft",
    );

    assert.equal(result.skipped, 2);
    assert.equal(result.created, 0);
    assert.equal(result.replaced, 0);
    assert.equal(
      client.queries.some((query) => /^UPDATE bible_(chapter_overviews|study_notes)/.test(query.text)),
      false,
    );
  });

  test("Replace changes importer-owned fields and the chosen status only", async () => {
    const client = new FakeClient();
    client.overview = { id: "overview-1", title: "Existing", summary: "Existing", status: "Published" };
    client.passages.set(1, {
      id: "note-1",
      status: "Published",
      verse_start: 1,
      verse_end: 5,
    });

    const result = await importBibleStudyChapter(
      client,
      "john",
      chapter({ content: "New explanation", related_scriptures: "Genesis 1:1" }),
      "import-2",
      "admin-1",
      "replace",
      "Draft",
    );

    assert.equal(result.replaced, 2);
    const mutations = client.queries.filter((query) => /^(INSERT|UPDATE|DELETE)/.test(query.text));
    assert.ok(mutations.some((query) => query.text.startsWith("UPDATE bible_chapter_overviews")));
    assert.ok(mutations.some((query) => query.text.startsWith("UPDATE bible_study_notes")));
    for (const mutation of mutations) {
      assert.doesNotMatch(
        mutation.text,
        /sermon|preached|cross_references|key_themes|important_people|important_places|source_records|psalm_metadata/i,
      );
    }
  });

  test("Merge fills only blank study fields and preserves a Published status", async () => {
    const client = new FakeClient();
    client.overview = { id: "overview-1", title: "Existing", summary: "", status: "Published" };
    client.passages.set(1, {
      id: "note-1",
      status: "Published",
      verse_start: 1,
      verse_end: 5,
    });

    const result = await importBibleStudyChapter(
      client,
      "john",
      chapter({ key_truth: "The Word is God" }),
      "import-3",
      "admin-1",
      "merge",
      "Draft",
    );

    assert.equal(result.merged, 2);
    assert.equal(result.published, 2);
    const noteUpdate = client.queries.find((query) =>
      query.text.startsWith("UPDATE bible_study_notes"),
    );
    assert.ok(noteUpdate);
    assert.match(noteUpdate.text, /CASE WHEN content = ''/);
    assert.ok(noteUpdate.values?.includes("Published"));
  });

  test("creates imported rows as Published when requested", async () => {
    const client = new FakeClient();
    const result = await importBibleStudyChapter(
      client,
      "john",
      chapter(),
      "import-4",
      "admin-1",
      "skip",
      "Published",
    );

    assert.equal(result.created, 2);
    assert.equal(result.published, 2);
    assert.ok(client.queries.some((query) => query.text.startsWith("INSERT INTO bible_chapter_overviews")));
    assert.ok(client.queries.some((query) => query.text.startsWith("INSERT INTO bible_study_notes")));
  });

  test("a passage write failure rolls back the whole chapter", async () => {
    const client = new FakeClient();
    client.failOn = /^INSERT INTO bible_study_notes/;

    await assert.rejects(
      withChapterTransaction(client, () =>
        importBibleStudyChapter(
          client,
          "john",
          chapter(),
          "import-5",
          "admin-1",
          "skip",
          "Draft",
        ),
      ),
      /simulated write failure/,
    );

    assert.equal(client.queries[0].text, "BEGIN");
    assert.equal(client.queries.at(-1)?.text, "ROLLBACK");
    assert.equal(client.queries.some((query) => query.text === "COMMIT"), false);
  });

  test("Replace can safely retarget one intersecting existing range", async () => {
    const client = new FakeClient();
    client.overview = { id: "overview-1", title: "", summary: "", status: "Draft" };
    client.passages.set(1, {
      id: "note-1",
      status: "Draft",
      verse_start: 1,
      verse_end: 10,
    });

    const result = await importBibleStudyChapter(
      client,
      "john",
      chapter(),
      "import-6",
      "admin-1",
      "replace",
      "Draft",
    );

    assert.equal(result.replaced, 2);
    const noteUpdate = client.queries.find((query) =>
      query.text.startsWith("UPDATE bible_study_notes"),
    );
    assert.ok(noteUpdate);
    assert.match(noteUpdate.text, /SET verse_start = \$1, verse_end = \$2/);
    assert.deepEqual(noteUpdate.values?.slice(0, 2), [1, 5]);
  });

  test("Merge rejects a non-exact intersecting range", async () => {
    const client = new FakeClient();
    client.passages.set(1, {
      id: "note-1",
      status: "Published",
      verse_start: 1,
      verse_end: 10,
    });

    await assert.rejects(
      importBibleStudyChapter(
        client,
        "john",
        chapter(),
        "import-7",
        "admin-1",
        "merge",
        "Draft",
      ),
      /without matching it exactly/,
    );
  });
});