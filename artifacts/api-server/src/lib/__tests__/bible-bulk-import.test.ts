// @ts-nocheck
/**
 * bible-bulk-import.test.ts
 *
 * Unit tests for the pure parser/validator in bible-bulk-import.ts.
 * No filesystem, network, or database access.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/bible-bulk-import.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseBulkImport,
  resolveBookId,
  parsePassageReference,
  resolveFieldLabel,
  CANONICAL_CHAPTER_COUNTS,
} from "../bible-bulk-import.ts";

// ─── resolveBookId ────────────────────────────────────────────────────────────

describe("resolveBookId", () => {
  it("resolves exact canonical id", () => {
    assert.equal(resolveBookId("john"), "john");
    assert.equal(resolveBookId("revelation"), "revelation");
  });

  it("resolves full name case-insensitively", () => {
    assert.equal(resolveBookId("Genesis"), "genesis");
    assert.equal(resolveBookId("Song of Solomon"), "songofsolomon");
  });

  it("resolves short alias", () => {
    assert.equal(resolveBookId("Rev"), "revelation");
    assert.equal(resolveBookId("gen"), "genesis");
    assert.equal(resolveBookId("1cor"), "1corinthians");
    assert.equal(resolveBookId("2tim"), "2timothy");
  });

  it("resolves numbered book with space", () => {
    assert.equal(resolveBookId("1 Samuel"), "1samuel");
    assert.equal(resolveBookId("2 Kings"), "2kings");
    assert.equal(resolveBookId("1 John"), "1john");
  });

  it("returns null for an unrecognised name", () => {
    assert.equal(resolveBookId("Hezekiah"), null);
    assert.equal(resolveBookId(""), null);
  });
});

// ─── parsePassageReference ────────────────────────────────────────────────────

describe("parsePassageReference", () => {
  it("parses full qualified reference: John 1:1-5", () => {
    const r = parsePassageReference("John 1:1-5", null, null);
    assert.deepEqual(r, {
      bookId: "john",
      chapter: 1,
      verseStart: 1,
      verseEnd: 5,
    });
  });

  it("parses single verse: John 3:16", () => {
    const r = parsePassageReference("John 3:16", null, null);
    assert.deepEqual(r, {
      bookId: "john",
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
    });
  });

  it("parses chapter-relative reference: 1:1-5", () => {
    const r = parsePassageReference("1:1-5", "john", 1);
    assert.deepEqual(r, {
      bookId: "john",
      chapter: 1,
      verseStart: 1,
      verseEnd: 5,
    });
  });

  it("parses chapter-relative single verse: 3:16", () => {
    const r = parsePassageReference("3:16", "john", 3);
    assert.deepEqual(r, {
      bookId: "john",
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
    });
  });

  it("handles alias in full reference: Rev 22:1-5", () => {
    const r = parsePassageReference("Rev 22:1-5", null, null);
    assert.deepEqual(r, {
      bookId: "revelation",
      chapter: 22,
      verseStart: 1,
      verseEnd: 5,
    });
  });

  it("returns null for unparseable string", () => {
    assert.equal(parsePassageReference("notaref", null, null), null);
    assert.equal(parsePassageReference("1:1-5", null, null), null); // no context
  });
});

// ─── resolveFieldLabel ────────────────────────────────────────────────────────

describe("resolveFieldLabel", () => {
  it("maps primary labels", () => {
    assert.equal(resolveFieldLabel("EXPLANATION"), "content");
    assert.equal(resolveFieldLabel("KEY_TRUTH"), "key_truth");
    assert.equal(resolveFieldLabel("RELATED_SCRIPTURES"), "related_scriptures");
    assert.equal(resolveFieldLabel("ORIGINAL_LANGUAGE"), "original_language_note");
    assert.equal(
      resolveFieldLabel("ORIGINAL_LANGUAGE_NOTE"),
      "original_language_note",
    );
  });

  it("maps alias labels", () => {
    assert.equal(resolveFieldLabel("CONTEXT"), "context_note");
    assert.equal(resolveFieldLabel("PASSAGE_CONTEXT"), "context_note");
    assert.equal(resolveFieldLabel("HISTORICAL_BACKGROUND"), "historical_note");
    assert.equal(resolveFieldLabel("HISTORICAL_NOTE"), "historical_note");
    assert.equal(resolveFieldLabel("HOW_THIS_POINTS_TO_JESUS"), "jesus_connection");
    assert.equal(resolveFieldLabel("JESUS_CONNECTION"), "jesus_connection");
    assert.equal(resolveFieldLabel("PRACTICAL_APPLICATION"), "apply_it");
    assert.equal(resolveFieldLabel("APPLY_IT"), "apply_it");
    assert.equal(resolveFieldLabel("REFLECTION"), "reflection_question");
    assert.equal(resolveFieldLabel("REFLECTION_QUESTION"), "reflection_question");
  });

  it("returns null for unknown label", () => {
    assert.equal(resolveFieldLabel("FOOBAR"), null);
    assert.equal(resolveFieldLabel("NOTES"), null);
  });
});

// ─── CANONICAL_CHAPTER_COUNTS ─────────────────────────────────────────────────

describe("CANONICAL_CHAPTER_COUNTS", () => {
  it("has exactly 66 books", () => {
    assert.equal(Object.keys(CANONICAL_CHAPTER_COUNTS).length, 66);
  });

  it("has correct counts for sampled books", () => {
    assert.equal(CANONICAL_CHAPTER_COUNTS["psalms"], 150);
    assert.equal(CANONICAL_CHAPTER_COUNTS["john"], 21);
    assert.equal(CANONICAL_CHAPTER_COUNTS["obadiah"], 1);
    assert.equal(CANONICAL_CHAPTER_COUNTS["revelation"], 22);
    assert.equal(CANONICAL_CHAPTER_COUNTS["genesis"], 50);
  });
});

// ─── parseBulkImport — single chapter ────────────────────────────────────────

describe("parseBulkImport — single chapter", () => {
  it("parses a minimal valid single-chapter block", async () => {
    const text = `
BOOK: John
CHAPTER: 1
TITLE: The Word Became Flesh
PASSAGE: John 1:1-5
EXPLANATION: In the beginning was the Word.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].bookId, "john");
    assert.equal(result.books[0].chapters.length, 1);
    const ch = result.books[0].chapters[0];
    assert.equal(ch.chapterNumber, 1);
    assert.equal(ch.title, "The Word Became Flesh");
    assert.equal(ch.passages.length, 1);
    const p = ch.passages[0];
    assert.equal(p.verseStart, 1);
    assert.equal(p.verseEnd, 5);
    assert.equal(p.fields["content"], "In the beginning was the Word.");
    assert.equal(result.totalPassages, 1);
    assert.equal(result.totalFieldValues, 1);
  });

  it("parses multiline field values", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: 1:1-3
EXPLANATION
This is the first line.
This is the second line.

CONTEXT: Short context.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const fields = result.books[0].chapters[0].passages[0].fields;
    assert.match(fields["content"], /first line/);
    assert.match(fields["content"], /second line/);
    assert.equal(fields["context_note"], "Short context.");
  });

  it("supports all optional fields being omitted", async () => {
    const text = `
BOOK: Genesis
CHAPTER: 1
PASSAGE: Genesis 1:1
EXPLANATION: God created the heavens and the earth.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const p = result.books[0].chapters[0].passages[0];
    assert.equal(Object.keys(p.fields).length, 1);
    assert.equal(p.fields["content"], "God created the heavens and the earth.");
  });

  it("parses CHAPTER_OVERVIEW", async () => {
    const text = `
BOOK: John
CHAPTER: 3
CHAPTER_OVERVIEW: Nicodemus visits Jesus at night.
PASSAGE: John 3:16
EXPLANATION: For God so loved the world.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const ch = result.books[0].chapters[0];
    assert.equal(ch.chapterOverview, "Nicodemus visits Jesus at night.");
  });
});

// ─── parseBulkImport — multiple chapters and books ───────────────────────────

describe("parseBulkImport — multiple chapters and books", () => {
  it("parses two chapters in the same book", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1-5
EXPLANATION: The Word.

CHAPTER: 2
PASSAGE: John 2:1-11
EXPLANATION: Water into wine.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].chapters.length, 2);
    assert.equal(result.books[0].chapters[0].chapterNumber, 1);
    assert.equal(result.books[0].chapters[1].chapterNumber, 2);
    assert.equal(result.totalPassages, 2);
  });

  it("parses two books with multiple chapters each", async () => {
    const text = `
BOOK: Genesis
CHAPTER: 1
PASSAGE: Genesis 1:1
EXPLANATION: Creation.

CHAPTER: 2
PASSAGE: Genesis 2:1
EXPLANATION: Day of rest.

BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION: The Word.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.books.length, 2);
    assert.equal(result.books[0].bookId, "genesis");
    assert.equal(result.books[0].chapters.length, 2);
    assert.equal(result.books[1].bookId, "john");
    assert.equal(result.books[1].chapters.length, 1);
    assert.equal(result.totalPassages, 3);
  });

  it("handles separators --- and === between sections", async () => {
    const text = `
BOOK: John
---
CHAPTER: 1
===
PASSAGE: John 1:1
---
EXPLANATION: The Word.
===
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].chapters[0].passages.length, 1);
  });
});

// ─── parseBulkImport — verse ranges ──────────────────────────────────────────

describe("parseBulkImport — verse ranges", () => {
  it("parses a multi-verse range correctly", async () => {
    const text = `
BOOK: Romans
CHAPTER: 3
PASSAGE: Romans 3:21-26
EXPLANATION: Righteousness of God.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const p = result.books[0].chapters[0].passages[0];
    assert.equal(p.verseStart, 21);
    assert.equal(p.verseEnd, 26);
  });

  it("parses a single verse (no range)", async () => {
    const text = `
BOOK: John
CHAPTER: 3
PASSAGE: John 3:16
EXPLANATION: Gospel summary.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const p = result.books[0].chapters[0].passages[0];
    assert.equal(p.verseStart, 16);
    assert.equal(p.verseEnd, 16);
  });

  it("parses multiple passages in one chapter", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1-5
EXPLANATION: The Word.

PASSAGE: John 1:6-13
EXPLANATION: John the Baptist.

PASSAGE: John 1:14-18
EXPLANATION: The Incarnation.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.books[0].chapters[0].passages.length, 3);
    assert.equal(result.totalPassages, 3);
  });
});

// ─── parseBulkImport — omitted optional fields ───────────────────────────────

describe("parseBulkImport — omitted optional fields", () => {
  it("does not add placeholders for missing optional fields", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION: The Word.
KEY_TRUTH: Jesus is God.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const fields = result.books[0].chapters[0].passages[0].fields;
    assert.ok(!("context_note" in fields));
    assert.ok(!("historical_note" in fields));
    assert.ok(!("apply_it" in fields));
    assert.equal(fields["content"], "The Word.");
    assert.equal(fields["key_truth"], "Jesus is God.");
  });
});

// ─── parseBulkImport — aliases ───────────────────────────────────────────────

describe("parseBulkImport — label aliases", () => {
  it("accepts CONTEXT alias for PASSAGE_CONTEXT", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
CONTEXT: Historical context.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(
      result.books[0].chapters[0].passages[0].fields["context_note"],
      "Historical context.",
    );
  });

  it("accepts HISTORICAL_BACKGROUND alias", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
HISTORICAL_BACKGROUND: First century Ephesus.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(
      result.books[0].chapters[0].passages[0].fields["historical_note"],
      "First century Ephesus.",
    );
  });

  it("accepts HOW_THIS_POINTS_TO_JESUS alias", async () => {
    const text = `
BOOK: Genesis
CHAPTER: 1
PASSAGE: Genesis 1:1
HOW_THIS_POINTS_TO_JESUS: Jesus is the Creator (Col 1:16).
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(
      result.books[0].chapters[0].passages[0].fields["jesus_connection"],
      "Jesus is the Creator (Col 1:16).",
    );
  });

  it("accepts PRACTICAL_APPLICATION alias", async () => {
    const text = `
BOOK: James
CHAPTER: 1
PASSAGE: James 1:2-4
PRACTICAL_APPLICATION: Rejoice in trials.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(
      result.books[0].chapters[0].passages[0].fields["apply_it"],
      "Rejoice in trials.",
    );
  });

  it("accepts REFLECTION alias", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
REFLECTION: How does Jesus being the Word change how you read Genesis?
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(
      result.books[0].chapters[0].passages[0].fields["reflection_question"],
      "How does Jesus being the Word change how you read Genesis?",
    );
  });
});

// ─── parseBulkImport — RELATED_SCRIPTURES ────────────────────────────────────

describe("parseBulkImport — RELATED_SCRIPTURES", () => {
  it("parses a related scriptures field", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1-5
RELATED_SCRIPTURES: Gen 1:1; Col 1:15-17; Heb 1:1-3
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const p = result.books[0].chapters[0].passages[0];
    assert.equal(p.fields["related_scriptures"], "Gen 1:1; Col 1:15-17; Heb 1:1-3");
  });

  it("parses multiline related scriptures", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
RELATED_SCRIPTURES
Gen 1:1
Col 1:15-17
Heb 1:1-3
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    const val = result.books[0].chapters[0].passages[0].fields["related_scriptures"];
    assert.match(val, /Gen 1:1/);
    assert.match(val, /Col 1:15-17/);
  });
});

// ─── parseBulkImport — validation errors ─────────────────────────────────────

describe("parseBulkImport — invalid chapter", () => {
  it("reports CHAPTER_OUT_OF_RANGE for john chapter 99", async () => {
    const text = `
BOOK: John
CHAPTER: 99
PASSAGE: John 99:1
EXPLANATION: Out of range.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("CHAPTER_OUT_OF_RANGE"), `codes: ${codes.join(", ")}`);
  });

  it("reports INVALID_CHAPTER for non-numeric chapter", async () => {
    const text = `
BOOK: John
CHAPTER: abc
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("INVALID_CHAPTER"), `codes: ${codes.join(", ")}`);
  });
});

describe("parseBulkImport — invalid verse", () => {
  it("reports REVERSED_VERSE_RANGE when end < start", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:10-3
EXPLANATION: Reversed range.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("REVERSED_VERSE_RANGE"), `codes: ${codes.join(", ")}`);
  });

  it("reports VERSE_OUT_OF_RANGE when resolver returns verse count", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:999
EXPLANATION: Way out of range.
`.trim();

    const resolver = (_bookId: string, _chapter: number) => 51; // John 1 has 51 verses
    const result = await parseBulkImport(text, resolver);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("VERSE_OUT_OF_RANGE"), `codes: ${codes.join(", ")}`);
  });

  it("does not report verse errors when resolver not provided", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:999
EXPLANATION: High verse, no resolver.
`.trim();

    const result = await parseBulkImport(text);
    // Without resolver, only reversal/negative checks apply
    const codes = result.errors.map((e) => e.code);
    assert.ok(!codes.includes("VERSE_OUT_OF_RANGE"));
  });
});

describe("parseBulkImport — duplicate passage range", () => {
  it("reports DUPLICATE_PASSAGE_RANGE for repeated range in same block", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1-5
EXPLANATION: First passage.

PASSAGE: John 1:1-5
EXPLANATION: Duplicate passage.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("DUPLICATE_PASSAGE_RANGE"), `codes: ${codes.join(", ")}`);
  });

  it("rejects overlapping passage ranges in the same chapter", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1-5
EXPLANATION: First range
PASSAGE: John 1:4-8
EXPLANATION: Overlapping range
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) => error.code === "OVERLAPPING_PASSAGE_RANGE"),
    );
  });

  it("rejects repeated chapter blocks and keeps overlap tracking across them", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1-5
EXPLANATION: First range

BOOK: John
CHAPTER: 1
PASSAGE: John 1:4-8
EXPLANATION: Overlapping range in a repeated chapter block
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((error) => error.code);
    assert.ok(codes.includes("DUPLICATE_CHAPTER"), `codes: ${codes.join(", ")}`);
    assert.ok(
      codes.includes("OVERLAPPING_PASSAGE_RANGE"),
      `codes: ${codes.join(", ")}`,
    );
  });

  it("does not flag same verse range in different chapters", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION: Chapter one.

CHAPTER: 2
PASSAGE: John 2:1
EXPLANATION: Chapter two (same verse number, different chapter).
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
  });
});

describe("parseBulkImport — wrong book/chapter in PASSAGE", () => {
  it("reports WRONG_BOOK_IN_PASSAGE when passage names a different book", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: Matthew 1:1
EXPLANATION: Wrong book.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("WRONG_BOOK_IN_PASSAGE"), `codes: ${codes.join(", ")}`);
  });

  it("reports WRONG_CHAPTER_IN_PASSAGE when passage names a different chapter", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 3:16
EXPLANATION: Wrong chapter.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("WRONG_CHAPTER_IN_PASSAGE"), `codes: ${codes.join(", ")}`);
  });
});

describe("parseBulkImport — field before PASSAGE", () => {
  it("reports FIELD_BEFORE_PASSAGE when a study field appears before any PASSAGE", async () => {
    const text = `
BOOK: John
CHAPTER: 1
EXPLANATION: This is before any passage marker.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("FIELD_BEFORE_PASSAGE"), `codes: ${codes.join(", ")}`);
  });
});

describe("parseBulkImport — unknown label", () => {
  it("reports UNKNOWN_LABEL warning for unrecognised uppercase label", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION: Known field.
FOOBAR: This is an unknown label.
`.trim();

    const result = await parseBulkImport(text);
    // Unknown label → warning, not error
    const warnCodes = result.warnings.map((w) => w.code);
    assert.ok(warnCodes.includes("UNKNOWN_LABEL"), `warnings: ${warnCodes.join(", ")}`);
    // Content from unknown label must NOT appear in fields
    const fields = result.books[0]?.chapters[0]?.passages[0]?.fields ?? {};
    assert.ok(!("foobar" in fields));
    assert.ok(
      !Object.values(fields).some((v) => v.includes("unknown label")),
    );
  });

  it("does not treat unknown label content as part of a known field", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION: The Word.
MYSTERY_FIELD: Should be ignored.
KEY_TRUTH: The truth.
`.trim();

    const result = await parseBulkImport(text);
    const warnCodes = result.warnings.map((w) => w.code);
    assert.ok(warnCodes.includes("UNKNOWN_LABEL"));
    const fields = result.books[0]?.chapters[0]?.passages[0]?.fields ?? {};
    assert.equal(fields["content"], "The Word.");
    assert.equal(fields["key_truth"], "The truth.");
    // No bleed-through of MYSTERY_FIELD content
    for (const v of Object.values(fields)) {
      assert.ok(!v.includes("Should be ignored"));
    }
  });
});

describe("parseBulkImport — CHAPTER before BOOK", () => {
  it("reports CHAPTER_BEFORE_BOOK", async () => {
    const text = `
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION: No book.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("CHAPTER_BEFORE_BOOK"), `codes: ${codes.join(", ")}`);
  });
});

describe("parseBulkImport — PASSAGE before BOOK", () => {
  it("reports PASSAGE_BEFORE_BOOK", async () => {
    const text = `
PASSAGE: John 1:1
EXPLANATION: No book or chapter.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("PASSAGE_BEFORE_BOOK"), `codes: ${codes.join(", ")}`);
  });
});

describe("parseBulkImport — unknown book", () => {
  it("reports UNKNOWN_BOOK for a non-existent book name", async () => {
    const text = `
BOOK: Hezekiah
CHAPTER: 1
PASSAGE: Hezekiah 1:1
EXPLANATION: Not a real book.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("UNKNOWN_BOOK"), `codes: ${codes.join(", ")}`);
  });
});

describe("parseBulkImport — malformed structure", () => {
  it("handles completely empty input", async () => {
    const result = await parseBulkImport("");
    assert.equal(result.books.length, 0);
    assert.equal(result.totalPassages, 0);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "MISSING_BOOK"));
  });

  it("handles only separators and blank lines", async () => {
    const result = await parseBulkImport("---\n\n===\n\n");
    assert.equal(result.books.length, 0);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "MISSING_BOOK"));
  });

  it("handles BOOK with no subsequent CHAPTER or PASSAGE", async () => {
    const result = await parseBulkImport("BOOK: John");
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].chapters.length, 0);
    assert.equal(result.totalPassages, 0);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "MISSING_CHAPTER"));
  });

  it("handles missing PASSAGE value", async () => {
    const text = `
BOOK: John
CHAPTER: 1
PASSAGE:
EXPLANATION: No reference given.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("MISSING_PASSAGE_VALUE"), `codes: ${codes.join(", ")}`);
  });

  it("rejects a chapter value with trailing characters", async () => {
    const result = await parseBulkImport(`
BOOK: John
CHAPTER: 1abc
PASSAGE: John 1:1
EXPLANATION: Invalid chapter marker
`.trim());
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "INVALID_CHAPTER"));
  });
});

describe("parseBulkImport — multiline prose", () => {
  it("keeps title-cased prose lines inside the current field", async () => {
    const result = await parseBulkImport(`
BOOK: John
CHAPTER: 1
PASSAGE: John 1:1
EXPLANATION:
In the Beginning
John deliberately echoes Genesis.
`.trim());

    assert.equal(result.valid, true);
    assert.match(
      result.books[0].chapters[0].passages[0].fields.content,
      /In the Beginning/,
    );
  });
});

describe("parseBulkImport — case-insensitive markers", () => {
  it("accepts lowercase markers", async () => {
    const text = `
book: John
chapter: 1
passage: John 1:1
explanation: The Word.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.books[0].bookId, "john");
    const fields = result.books[0].chapters[0].passages[0].fields;
    assert.equal(fields["content"], "The Word.");
  });

  it("accepts mixed-case markers", async () => {
    const text = `
Book: John
Chapter: 1
Passage: John 1:1
Explanation: The Word.
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
  });
});

describe("parseBulkImport — full rich passage", () => {
  it("captures all nine study fields", async () => {
    const text = `
BOOK: John
CHAPTER: 1
TITLE: In the Beginning Was the Word
CHAPTER_OVERVIEW: John 1 introduces Jesus as the eternal Word made flesh.

PASSAGE: John 1:1-5
EXPLANATION: John opens with a cosmic declaration about the Word.
CONTEXT: Written to a Greek-speaking audience in Ephesus.
HISTORICAL_BACKGROUND: First century Jewish and Greek philosophy.
ORIGINAL_LANGUAGE_NOTE: The Greek word Logos carries rich meaning.
JESUS_CONNECTION: The Word is identified as Jesus Christ incarnate.
APPLY_IT: Trust that Jesus, the Light, is never overcome by darkness.
KEY_TRUTH: Jesus is the eternal, uncreated Word of God.
REFLECTION_QUESTION: How does knowing Jesus as the Word shape your reading of Genesis?
RELATED_SCRIPTURES: Gen 1:1; Col 1:15-17; Heb 1:1-3; 1 John 1:1-4
`.trim();

    const result = await parseBulkImport(text);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    const p = result.books[0].chapters[0].passages[0];
    assert.equal(p.fields["content"], "John opens with a cosmic declaration about the Word.");
    assert.equal(p.fields["context_note"], "Written to a Greek-speaking audience in Ephesus.");
    assert.equal(p.fields["historical_note"], "First century Jewish and Greek philosophy.");
    assert.equal(p.fields["original_language_note"], "The Greek word Logos carries rich meaning.");
    assert.match(p.fields["jesus_connection"], /incarnate/);
    assert.equal(p.fields["apply_it"], "Trust that Jesus, the Light, is never overcome by darkness.");
    assert.equal(p.fields["key_truth"], "Jesus is the eternal, uncreated Word of God.");
    assert.match(p.fields["reflection_question"], /Genesis/);
    assert.match(p.fields["related_scriptures"], /Col 1:15-17/);
    assert.equal(result.totalFieldValues, 9);
  });
});

describe("parseBulkImport — lineNumber in diagnostics", () => {
  it("reports correct line number for CHAPTER_BEFORE_BOOK", async () => {
    const lines = [
      "CHAPTER: 1",
      "PASSAGE: John 1:1",
      "EXPLANATION: No book.",
    ];
    const result = await parseBulkImport(lines.join("\n"));
    const err = result.errors.find((e) => e.code === "CHAPTER_BEFORE_BOOK");
    assert.ok(err, "should have CHAPTER_BEFORE_BOOK error");
    assert.equal(err.lineNumber, 1);
  });

  it("reports correct line number for CHAPTER_OUT_OF_RANGE", async () => {
    const lines = [
      "BOOK: John",
      "CHAPTER: 99",
    ];
    const result = await parseBulkImport(lines.join("\n"));
    const err = result.errors.find((e) => e.code === "CHAPTER_OUT_OF_RANGE");
    assert.ok(err, "should have CHAPTER_OUT_OF_RANGE error");
    assert.equal(err.lineNumber, 2);
  });
});
