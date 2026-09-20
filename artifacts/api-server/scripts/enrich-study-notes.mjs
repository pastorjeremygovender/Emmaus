/**
 * enrich-study-notes.mjs
 *
 * Generates key_truth, reflection_question, and related_scriptures for every
 * study note in bible-study-notes-seed.json that is currently missing them.
 *
 * Steps:
 *   1. Load the seed JSON
 *   2. Call OpenAI (gpt-4o-mini) in parallel batches to generate the 3 fields
 *   3. Write the enriched JSON back to disk
 *   4. Patch the live Postgres database rows that are still empty
 *
 * Usage: node artifacts/api-server/scripts/enrich-study-notes.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, '../src/data/bible-study-notes-seed.json');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL   = process.env.DATABASE_URL;

if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }
if (!DATABASE_URL)   { console.error('DATABASE_URL not set');   process.exit(1); }

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, retries = 4, delayMs = 2000) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries) throw err;
      const wait = delayMs * Math.pow(2, i);
      console.warn(`  retry ${i + 1}/${retries} after ${wait}ms — ${err.message}`);
      await sleep(wait);
    }
  }
}

async function batchProcess(items, processor, concurrency = 12) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await processor(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── per-note generation ───────────────────────────────────────────────────────

const BOOK_NAMES = {
  genesis:'Genesis', exodus:'Exodus', leviticus:'Leviticus', numbers:'Numbers',
  deuteronomy:'Deuteronomy', joshua:'Joshua', judges:'Judges', ruth:'Ruth',
  '1samuel':'1 Samuel','2samuel':'2 Samuel','1kings':'1 Kings','2kings':'2 Kings',
  '1chronicles':'1 Chronicles','2chronicles':'2 Chronicles', ezra:'Ezra',
  nehemiah:'Nehemiah', esther:'Esther', job:'Job', psalms:'Psalms',
  proverbs:'Proverbs', ecclesiastes:'Ecclesiastes', songofsolomon:'Song of Solomon',
  isaiah:'Isaiah', jeremiah:'Jeremiah', lamentations:'Lamentations', ezekiel:'Ezekiel',
  daniel:'Daniel', hosea:'Hosea', joel:'Joel', amos:'Amos', obadiah:'Obadiah',
  jonah:'Jonah', micah:'Micah', nahum:'Nahum', habakkuk:'Habakkuk',
  zephaniah:'Zephaniah', haggai:'Haggai', zechariah:'Zechariah', malachi:'Malachi',
  matthew:'Matthew', mark:'Mark', luke:'Luke', john:'John', acts:'Acts',
  romans:'Romans','1corinthians':'1 Corinthians','2corinthians':'2 Corinthians',
  galatians:'Galatians', ephesians:'Ephesians', philippians:'Philippians',
  colossians:'Colossians','1thessalonians':'1 Thessalonians','2thessalonians':'2 Thessalonians',
  '1timothy':'1 Timothy','2timothy':'2 Timothy', titus:'Titus', philemon:'Philemon',
  hebrews:'Hebrews', james:'James','1peter':'1 Peter','2peter':'2 Peter',
  '1john':'1 John','2john':'2 John','3john':'3 John', jude:'Jude', revelation:'Revelation',
};

async function generateFields(note) {
  const bookName = BOOK_NAMES[note.book_id] ?? note.book_id;
  const verseRange = note.verse_end && note.verse_end !== note.verse_start
    ? `${note.verse_start}–${note.verse_end}`
    : String(note.verse_start);
  const ref = `${bookName} ${note.chapter}:${verseRange}`;

  const prompt = `You are a biblical scholar writing concise study content for a Christian discipleship app.

Passage: ${ref} — "${note.title}"

EXISTING CONTENT:
Explanation: ${note.content}
Jesus Connection: ${note.jesus_connection}
Apply It: ${note.apply_it}

Generate ONLY a JSON object with exactly these three fields:
{
  "key_truth": "One clear, memorable sentence stating the central truth of this passage (not a question, not a list — a definitive theological statement).",
  "reflection_question": "One probing personal question that invites the reader to examine their own heart or life in light of this passage. Start with 'Where', 'How', 'What', or 'When'. No bullet points.",
  "related_scriptures": "3–5 Bible references that illuminate the same theme, comma-separated (e.g. John 3:16, Romans 5:8, Ephesians 2:8-9). Do NOT repeat the passage itself."
}

Return ONLY valid JSON, no markdown, no explanation.`;

  return withRetry(async () => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = completion.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw);
    if (!parsed.key_truth || !parsed.reflection_question || !parsed.related_scriptures) {
      throw new Error(`Incomplete fields for ${ref}: ${JSON.stringify(parsed)}`);
    }
    return {
      key_truth:            String(parsed.key_truth).trim(),
      reflection_question:  String(parsed.reflection_question).trim(),
      related_scriptures:   String(parsed.related_scriptures).trim(),
    };
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load seed JSON
  const notes = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  console.log(`Loaded ${notes.length} notes from seed JSON`);

  const toEnrich = notes.filter(
    n => !n.key_truth?.trim() || !n.reflection_question?.trim() || !n.related_scriptures?.trim()
  );
  console.log(`${toEnrich.length} notes need enrichment`);

  if (toEnrich.length === 0) {
    console.log('Nothing to do — all notes already have the three fields.');
    return;
  }

  // 2. Generate in parallel batches
  let done = 0;
  const enriched = new Map(); // book_id+chapter+verse_start → fields

  await batchProcess(toEnrich, async (note, i) => {
    const key = `${note.book_id}:${note.chapter}:${note.verse_start}`;
    try {
      const fields = await generateFields(note);
      enriched.set(key, fields);
      done++;
      if (done % 50 === 0 || done === toEnrich.length) {
        console.log(`  Progress: ${done}/${toEnrich.length} (${Math.round(done/toEnrich.length*100)}%)`);
      }
    } catch (err) {
      console.error(`  FAILED ${key}: ${err.message}`);
      // Use safe fallback so nothing is left completely empty
      enriched.set(key, {
        key_truth: '',
        reflection_question: '',
        related_scriptures: '',
      });
    }
  }, 12);

  // 3. Apply generated fields to seed JSON
  for (const note of notes) {
    const key = `${note.book_id}:${note.chapter}:${note.verse_start}`;
    const fields = enriched.get(key);
    if (fields) {
      note.key_truth           = fields.key_truth;
      note.reflection_question = fields.reflection_question;
      note.related_scriptures  = fields.related_scriptures;
    }
  }

  writeFileSync(SEED_PATH, JSON.stringify(notes, null, 2));
  console.log(`\nSeed JSON updated: ${SEED_PATH}`);

  // 4. Patch live database — update rows where fields are still empty
  const { Pool } = pg;
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Fetch all existing DB rows that need updating
    const { rows: dbNotes } = await pool.query(
      `SELECT id, book_id, chapter, verse_start
       FROM bible_study_notes
       WHERE (key_truth IS NULL OR key_truth = '')
          OR (reflection_question IS NULL OR reflection_question = '')
          OR (related_scriptures IS NULL OR related_scriptures = '')`
    );
    console.log(`\nFound ${dbNotes.length} database rows to update`);

    let dbUpdated = 0;
    for (const row of dbNotes) {
      const key = `${row.book_id}:${row.chapter}:${row.verse_start}`;
      const fields = enriched.get(key);
      if (!fields) {
        console.warn(`  No generated fields for DB row ${row.id} (${key})`);
        continue;
      }
      await pool.query(
        `UPDATE bible_study_notes
         SET key_truth = $1, reflection_question = $2, related_scriptures = $3, updated_at = now()
         WHERE id = $4`,
        [fields.key_truth, fields.reflection_question, fields.related_scriptures, row.id]
      );
      dbUpdated++;
    }
    console.log(`Database updated: ${dbUpdated} rows patched`);
  } finally {
    await pool.end();
  }

  // Summary
  const filled = notes.filter(n => n.key_truth?.trim()).length;
  console.log(`\n✓ Done. ${filled}/${notes.length} notes now have key_truth.`);
  const missing = notes.filter(n => !n.key_truth?.trim());
  if (missing.length > 0) {
    console.warn(`Still missing (${missing.length}):`);
    missing.forEach(n => console.warn(`  ${n.book_id} ${n.chapter}:${n.verse_start}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
