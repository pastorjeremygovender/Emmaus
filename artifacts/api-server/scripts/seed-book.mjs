/**
 * seed-book.mjs  <bookId> [startChapter] [endChapter]
 *
 * Seeds one Bible book's chapters (chapter-batch) and then publishes them.
 * Designed to be called repeatedly, one book at a time, to stay within the
 * 5-minute shell timeout.
 *
 * Examples:
 *   node seed-book.mjs luke           → all 24 chapters
 *   node seed-book.mjs psalms 1 50    → chapters 1–50 only
 */

const BASE   = 'http://localhost:8080';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-user-id':    'demo-superadmin-1',
  'x-user-role':  'superAdmin',
};

const CHAPTER_COUNTS = {
  luke: 24, acts: 28, romans: 16,
  '1corinthians': 16, '2corinthians': 13,
  psalms: 150,
};

const bookId = process.argv[2];
if (!bookId || !CHAPTER_COUNTS[bookId]) {
  console.error('Usage: node seed-book.mjs <bookId> [startChapter] [endChapter]');
  console.error('Books:', Object.keys(CHAPTER_COUNTS).join(', '));
  process.exit(1);
}

const totalChapters = CHAPTER_COUNTS[bookId];
const startCh = parseInt(process.argv[3] ?? '1', 10);
const endCh   = parseInt(process.argv[4] ?? String(totalChapters), 10);
const CONCURRENCY = 8;

async function generate(chapter) {
  try {
    const r = await fetch(`${BASE}/api/bible/generate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ type: 'chapter-batch', bookId, chapter }),
    });
    if (r.status === 409) return { skipped: true, chapter };
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return { error: err.error ?? `HTTP ${r.status}`, chapter };
    }
    const data = await r.json();
    return { ok: true, chapter, passages: data.passages?.length ?? 0 };
  } catch (err) {
    return { error: err.message, chapter };
  }
}

async function bulkPublish() {
  // Publish passages
  const notesRes = await fetch(`${BASE}/api/bible/study-notes/admin?bookId=${bookId}`, { headers: HEADERS });
  if (notesRes.ok) {
    const notes = await notesRes.json();
    const ids = notes.filter(n => n.status !== 'Published').map(n => n.id);
    if (ids.length) {
      await fetch(`${BASE}/api/bible/study-notes/admin/bulk/status`, {
        method: 'PATCH', headers: HEADERS,
        body: JSON.stringify({ ids, status: 'Published' }),
      });
      console.log(`  ✓ Published ${ids.length} study note passages`);
    }
  }

  // Publish chapter overviews
  const ovRes = await fetch(`${BASE}/api/bible/chapter-overview/admin?bookId=${bookId}`, { headers: HEADERS });
  if (ovRes.ok) {
    const overviews = await ovRes.json();
    const unpublished = overviews.filter(o => o.status !== 'Published');
    for (const ov of unpublished) {
      await fetch(`${BASE}/api/bible/chapter-overview/admin/${ov.id}/status`, {
        method: 'PATCH', headers: HEADERS,
        body: JSON.stringify({ status: 'Published' }),
      });
    }
    if (unpublished.length) console.log(`  ✓ Published ${unpublished.length} chapter overviews`);
  }

  // Publish book intro
  const introRes = await fetch(`${BASE}/api/bible/book-intro/admin?bookId=${bookId}`, { headers: HEADERS });
  if (introRes.ok) {
    const intros = await introRes.json();
    for (const intro of intros) {
      if (intro.status !== 'Published') {
        await fetch(`${BASE}/api/bible/book-intro/admin/${intro.id}/status`, {
          method: 'PATCH', headers: HEADERS,
          body: JSON.stringify({ status: 'Published' }),
        });
        console.log('  ✓ Published book introduction');
      }
    }
  }
}

async function run() {
  const t0 = Date.now();
  const chapters = Array.from({ length: endCh - startCh + 1 }, (_, i) => startCh + i);
  console.log(`\nSeeding ${bookId} chapters ${startCh}–${endCh} (${chapters.length} total, concurrency ${CONCURRENCY})\n`);

  let done = 0, ok = 0, skipped = 0, errors = 0;
  const queue = [...chapters];

  const workers = Array.from({ length: Math.min(CONCURRENCY, chapters.length) }, async () => {
    while (queue.length > 0) {
      const ch = queue.shift();
      if (ch == null) break;
      const result = await generate(ch);
      done++;
      if (result.skipped) { skipped++; process.stdout.write(`s`); }
      else if (result.error) { errors++; process.stdout.write(`✗`); console.error(`\n  ch${ch}: ${result.error}`); }
      else { ok++; process.stdout.write(`·`); }
      if (done % 10 === 0) process.stdout.write(` ${done}/${chapters.length}\n`);
    }
  });

  await Promise.all(workers);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\n\nGenerated: ${ok} ok, ${skipped} skipped, ${errors} errors — ${elapsed}s`);

  console.log('\nPublishing...');
  await bulkPublish();
  console.log(`\n✓ ${bookId} ch${startCh}–${endCh} done`);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
