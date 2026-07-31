/**
 * seed-bible-study.mjs
 *
 * Seeds Bible study content for all 6 target books.
 * Calls the local generate API with concurrency to complete quickly.
 *
 * Usage:  node artifacts/api-server/scripts/seed-bible-study.mjs
 *
 * Phases:
 *   1. Book introductions — all 6 books
 *   2. Chapter batches (overview + passages) — Luke, Acts (all chapters)
 *   3. Chapter batches — Romans, 1 Cor, 2 Cor (all chapters)
 *   4. Chapter batches — Psalms 1–50 (Phase 3 per spec)
 *   5. Bulk-publish all generated content
 */

const BASE = 'http://localhost:8080';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-user-id': 'demo-superadmin-1',
  'x-user-role': 'superAdmin',
};

const BOOKS = [
  { id: 'luke',         name: 'Luke',           chapters: 24  },
  { id: 'acts',         name: 'Acts',           chapters: 28  },
  { id: 'romans',       name: 'Romans',         chapters: 16  },
  { id: '1corinthians', name: '1 Corinthians',  chapters: 16  },
  { id: '2corinthians', name: '2 Corinthians',  chapters: 13  },
  { id: 'psalms',       name: 'Psalms',         chapters: 150 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generate(type, bookId, chapter) {
  const body = { type, bookId };
  if (chapter != null) body.chapter = chapter;

  try {
    const r = await fetch(`${BASE}/api/bible/generate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (r.status === 409) {
      return { skipped: true }; // already Published, skip
    }

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const msg = err.error ?? `HTTP ${r.status}`;
      console.error(`  ✗ ${type} ${bookId}${chapter != null ? ` ch${chapter}` : ''}: ${msg}`);
      return null;
    }

    return await r.json();
  } catch (err) {
    console.error(`  ✗ ${type} ${bookId}${chapter != null ? ` ch${chapter}` : ''}: ${err.message}`);
    return null;
  }
}

async function runWithConcurrency(items, fn, concurrency = 4) {
  const queue = [...items];
  let done = 0;
  const total = queue.length;

  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item == null) break;
      await fn(item);
      done++;
      if (done % 5 === 0 || done === total) {
        process.stdout.write(`    ${done}/${total} complete\n`);
      }
    }
  });

  await Promise.all(workers);
}

async function bulkPublish(bookId) {
  // Publish all In Review passages for the book
  const r = await fetch(`${BASE}/api/bible/study-notes/admin?bookId=${bookId}`, {
    headers: HEADERS,
  });
  if (!r.ok) return;

  const notes = await r.json();
  const ids = notes.filter(n => n.status === 'Draft' || n.status === 'In Review').map(n => n.id);

  if (ids.length > 0) {
    await fetch(`${BASE}/api/bible/study-notes/admin/bulk/status`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ ids, status: 'Published' }),
    });
    console.log(`  Published ${ids.length} passages for ${bookId}`);
  }

  // Publish chapter overviews
  const ovRes = await fetch(`${BASE}/api/bible/chapter-overview/admin?bookId=${bookId}`, {
    headers: HEADERS,
  });
  if (ovRes.ok) {
    const overviews = await ovRes.json();
    for (const ov of overviews) {
      if (ov.status === 'Draft' || ov.status === 'In Review') {
        await fetch(`${BASE}/api/bible/chapter-overview/admin/${ov.id}/status`, {
          method: 'PATCH',
          headers: HEADERS,
          body: JSON.stringify({ status: 'Published' }),
        });
      }
    }
    console.log(`  Published ${overviews.filter(o => o.status !== 'Published').length} overviews for ${bookId}`);
  }

  // Publish book intro
  const introRes = await fetch(`${BASE}/api/bible/book-intro/admin?bookId=${bookId}`, {
    headers: HEADERS,
  });
  if (introRes.ok) {
    const intros = await introRes.json();
    for (const intro of intros) {
      if (intro.status !== 'Published') {
        await fetch(`${BASE}/api/bible/book-intro/admin/${intro.id}/status`, {
          method: 'PATCH',
          headers: HEADERS,
          body: JSON.stringify({ status: 'Published' }),
        });
        console.log(`  Published book intro for ${bookId}`);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log('=== Emmaus Bible Study Seed ===\n');

  // ── Phase 1: Book introductions ────────────────────────────────────────────
  console.log('Phase 1: Book introductions');
  for (const book of BOOKS) {
    process.stdout.write(`  ${book.name}... `);
    const r = await generate('book-intro', book.id);
    if (r?.skipped) console.log('skipped (Published)');
    else if (r) console.log('✓');
  }

  // ── Phase 2: Luke (all 24 chapters) ──────────────────────────────────────
  console.log('\nPhase 2: Luke (24 chapters)');
  await runWithConcurrency(
    Array.from({ length: 24 }, (_, i) => i + 1),
    async (ch) => {
      const r = await generate('chapter-batch', 'luke', ch);
      const p = r?.passages?.length ?? 0;
      if (!r?.skipped && r) process.stdout.write(`  Luke ${ch} (${p}p) `);
    },
    4
  );

  // ── Phase 3: Acts (all 28 chapters) ──────────────────────────────────────
  console.log('\nPhase 3: Acts (28 chapters)');
  await runWithConcurrency(
    Array.from({ length: 28 }, (_, i) => i + 1),
    async (ch) => {
      const r = await generate('chapter-batch', 'acts', ch);
      const p = r?.passages?.length ?? 0;
      if (!r?.skipped && r) process.stdout.write(`  Acts ${ch} (${p}p) `);
    },
    4
  );

  // ── Phase 4: Romans, 1 Cor, 2 Cor (all chapters) ─────────────────────────
  const epistles = [
    { id: 'romans', name: 'Romans', chapters: 16 },
    { id: '1corinthians', name: '1 Corinthians', chapters: 16 },
    { id: '2corinthians', name: '2 Corinthians', chapters: 13 },
  ];
  for (const book of epistles) {
    console.log(`\nPhase 4: ${book.name} (${book.chapters} chapters)`);
    await runWithConcurrency(
      Array.from({ length: book.chapters }, (_, i) => i + 1),
      async (ch) => {
        const r = await generate('chapter-batch', book.id, ch);
        const p = r?.passages?.length ?? 0;
        if (!r?.skipped && r) process.stdout.write(`  ${book.name} ${ch} (${p}p) `);
      },
      4
    );
  }

  // ── Phase 5: Psalms 1–50 ──────────────────────────────────────────────────
  console.log('\nPhase 5: Psalms 1–50');
  await runWithConcurrency(
    Array.from({ length: 50 }, (_, i) => i + 1),
    async (ch) => {
      const r = await generate('chapter-batch', 'psalms', ch);
      const p = r?.passages?.length ?? 0;
      if (!r?.skipped && r) process.stdout.write(`  Ps${ch}(${p}p) `);
    },
    5
  );

  // ── Phase 6: Psalms 51–100 ────────────────────────────────────────────────
  console.log('\n\nPhase 6: Psalms 51–100');
  await runWithConcurrency(
    Array.from({ length: 50 }, (_, i) => i + 51),
    async (ch) => {
      const r = await generate('chapter-batch', 'psalms', ch);
      const p = r?.passages?.length ?? 0;
      if (!r?.skipped && r) process.stdout.write(`  Ps${ch}(${p}p) `);
    },
    5
  );

  // ── Phase 7: Psalms 101–150 ───────────────────────────────────────────────
  console.log('\n\nPhase 7: Psalms 101–150');
  await runWithConcurrency(
    Array.from({ length: 50 }, (_, i) => i + 101),
    async (ch) => {
      const r = await generate('chapter-batch', 'psalms', ch);
      const p = r?.passages?.length ?? 0;
      if (!r?.skipped && r) process.stdout.write(`  Ps${ch}(${p}p) `);
    },
    5
  );

  // ── Phase 8: Publish everything ───────────────────────────────────────────
  console.log('\n\nPhase 8: Publishing all generated content');
  for (const book of BOOKS) {
    process.stdout.write(`  ${book.name}... `);
    await bulkPublish(book.id);
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✓ Seed complete in ${elapsed}s`);
  console.log('\nNext steps:');
  console.log('  • Open Admin → Content Studio → Bible Study to verify progress');
  console.log('  • Open the Bible reader, select any verse, tap Study to see content');
  console.log('  • Use the Generator to fill in Psalms 51–150 or remaining chapters');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
