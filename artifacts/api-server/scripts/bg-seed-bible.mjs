/**
 * bg-seed-bible.mjs — Background Bible study content seeder
 *
 * Runs directly against the DB and OpenAI (no HTTP layer) so it can take as
 * long as needed. Designed to be started with nohup and left running.
 *
 * Usage:
 *   nohup node artifacts/api-server/scripts/bg-seed-bible.mjs \
 *     > /tmp/bible-seed.log 2>&1 &
 *   tail -f /tmp/bible-seed.log
 *
 * Skips chapters that already have a Published chapter overview.
 * Concurrency: 2 (conservative for a slow model).
 */

import OpenAI from "/home/runner/workspace/node_modules/.pnpm/openai@4.104.0_zod@3.25.76/node_modules/openai/index.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('/home/runner/workspace/node_modules/.pnpm/pg@8.22.0/node_modules/pg');
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "bible");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const isOSeries = /^o\d/i.test(MODEL);

function log(...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}]`, ...args);
}

const BOOKS = [
  { id: "luke",         name: "Luke",          chapters: 24  },
  { id: "acts",         name: "Acts",          chapters: 28  },
  { id: "romans",       name: "Romans",        chapters: 16  },
  { id: "1corinthians", name: "1 Corinthians", chapters: 16  },
  { id: "2corinthians", name: "2 Corinthians", chapters: 13  },
  { id: "psalms",       name: "Psalms",        chapters: 150 },
];

function readChapter(bookId, chapter) {
  const fp = join(DATA_DIR, "bsb", `${bookId}.json`);
  if (!existsSync(fp)) return null;
  const data = JSON.parse(readFileSync(fp, "utf-8"));
  return data.chapters?.[String(chapter)] ?? null;
}

async function alreadyDone(bookId, chapter) {
  const r = await pool.query(
    "SELECT id FROM bible_chapter_overviews WHERE book_id=$1 AND chapter=$2 AND status='Published' LIMIT 1",
    [bookId, chapter]
  );
  return r.rowCount > 0;
}

async function generateChapter(bookId, bookName, chapter) {
  const verses = readChapter(bookId, chapter);
  if (!verses || verses.length === 0) {
    log(`  SKIP ${bookName} ${chapter} — no BSB data`);
    return false;
  }
  const verseText = verses.map(v => `${v.verse} ${v.text}`).join("\n");

  const prompt = `You are a biblical scholar creating study content for the Emmaus Christian app.
Generate study content for ${bookName} chapter ${chapter}.

FULL CHAPTER TEXT:
${verseText}

Return ONLY a valid JSON object (no markdown):
{
  "overview": {
    "summary": "2–4 sentences summarising what happens in this chapter",
    "main_themes": ["theme1", "theme2"],
    "important_people": ["person1"],
    "important_locations": ["place1"],
    "passage_divisions": [
      {"title": "Passage Title", "verse_start": 1, "verse_end": 5},
      {"title": "Another Passage", "verse_start": 6, "verse_end": 13}
    ],
    "key_verse": "verse reference e.g. ${bookName} ${chapter}:3",
    "book_connection": "1–2 sentences on how this chapter fits the wider book",
    "jesus_connection": "1–2 sentences on how this chapter relates to Jesus or the gospel"
  },
  "passages": [
    {
      "title": "Passage Title",
      "verse_start": 1,
      "verse_end": 5,
      "content": "2–4 paragraphs explaining what is happening and its meaning. Clear, faithful, accessible.",
      "context_note": "What comes before and after; how it fits the chapter and book",
      "historical_note": "Relevant historical or cultural background (empty string if not needed)",
      "original_language_note": "Key Greek or Hebrew word if significant (empty string if not needed)",
      "jesus_connection": "How this passage connects to Jesus — direct, typological, or thematic.",
      "apply_it": "2–3 questions or invitations for reflection. Invitational, not prescriptive.",
      "cross_references": [
        {"reference": "Book Chapter:Verse", "explanation": "why connected", "type": "Shared Theme"}
      ]
    }
  ]
}
Cross-reference types: Quotation, Fulfilment, Parallel Event, Shared Theme, Explanation, Contrast, Promise, Old Testament Background, Gospel Connection.
Keep content concise and mobile-friendly.`;

  const createParams = {
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 6000,
    response_format: { type: "json_object" },
  };
  if (isOSeries) createParams.reasoning_effort = "low";

  const completion = await openai.chat.completions.create(createParams);
  const raw = JSON.parse(completion.choices[0].message.content ?? "{}");
  const ov = raw.overview ?? {};

  // Upsert chapter overview
  const ovResult = await pool.query(
    `INSERT INTO bible_chapter_overviews
       (book_id, chapter, summary, main_themes, important_people, important_locations,
        passage_divisions, key_verse, book_connection, jesus_connection, status, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Published','seed','seed')
     ON CONFLICT (book_id, chapter) DO UPDATE SET
       summary=$3, main_themes=$4, important_people=$5, important_locations=$6,
       passage_divisions=$7, key_verse=$8, book_connection=$9, jesus_connection=$10,
       status='Published', updated_by='seed', updated_at=now()
     RETURNING id`,
    [
      bookId, chapter,
      ov.summary ?? "", JSON.stringify(ov.main_themes ?? []),
      JSON.stringify(ov.important_people ?? []), JSON.stringify(ov.important_locations ?? []),
      JSON.stringify(ov.passage_divisions ?? []), ov.key_verse ?? "",
      ov.book_connection ?? "", ov.jesus_connection ?? "",
    ]
  );

  let passageCount = 0;
  if (Array.isArray(raw.passages)) {
    for (const p of raw.passages) {
      await pool.query(
        `INSERT INTO bible_study_notes
           (book_id, chapter, verse_start, verse_end, title, content,
            context_note, historical_note, original_language_note, jesus_connection,
            apply_it, cross_references, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Published','seed','seed')
         ON CONFLICT (book_id, chapter, verse_start) DO UPDATE SET
           verse_end=$4, title=$5, content=$6, context_note=$7, historical_note=$8,
           original_language_note=$9, jesus_connection=$10, apply_it=$11,
           cross_references=$12, status='Published', updated_by='seed', updated_at=now()`,
        [
          bookId, chapter, p.verse_start ?? 1, p.verse_end ?? p.verse_start ?? 1,
          p.title ?? "", p.content ?? "", p.context_note ?? "",
          p.historical_note ?? "", p.original_language_note ?? "",
          p.jesus_connection ?? "", p.apply_it ?? "",
          JSON.stringify(p.cross_references ?? []),
        ]
      );
      passageCount++;
    }
  }

  log(`  ✓ ${bookName} ch${chapter} — ${passageCount} passages, overview saved`);
  return true;
}

async function runWithConcurrency(items, fn, concurrency = 2) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item == null) break;
      await fn(item).catch(err => log(`  ERROR: ${err.message}`));
    }
  });
  await Promise.all(workers);
}

async function main() {
  log("=== Emmaus Bible Background Seeder ===");
  log(`Model: ${MODEL}`);
  log("Starting...\n");

  for (const book of BOOKS) {
    log(`\n--- ${book.name} (${book.chapters} chapters) ---`);
    const chapters = [];
    for (let ch = 1; ch <= book.chapters; ch++) {
      const done = await alreadyDone(book.id, ch);
      if (!done) chapters.push(ch);
    }
    log(`  ${book.chapters - chapters.length} already done, ${chapters.length} to generate`);
    if (chapters.length === 0) continue;

    await runWithConcurrency(
      chapters,
      (ch) => generateChapter(book.id, book.name, ch),
      2
    );
  }

  log("\n✓ All books seeded and published.");
  await pool.end();
}

main().catch(err => {
  log("FATAL:", err.message);
  pool.end();
  process.exit(1);
});
