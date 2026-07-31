/**
 * seed-multi.mjs — seeds a set of book:start:end triples in one flat queue.
 * Usage:  node seed-multi.mjs  luke:19:24  acts:1:28  romans:1:16
 * All chapters across all specified books share a single concurrency pool.
 */

const BASE   = 'http://localhost:8080';
const HEADERS = { 'Content-Type': 'application/json', 'x-user-id': 'demo-superadmin-1', 'x-user-role': 'superAdmin' };
const CONCURRENCY = 8;

const specs = process.argv.slice(2).map(s => {
  const [book, start, end] = s.split(':');
  return { book, start: parseInt(start, 10), end: parseInt(end, 10) };
});

if (specs.length === 0) {
  console.error('Usage: node seed-multi.mjs book:start:end [book:start:end ...]');
  process.exit(1);
}

const tasks = specs.flatMap(({ book, start, end }) =>
  Array.from({ length: end - start + 1 }, (_, i) => ({ book, ch: start + i }))
);

console.log(`Tasks: ${tasks.length} chapters, concurrency: ${CONCURRENCY}`);
console.log(specs.map(s => `${s.book} ${s.start}-${s.end}`).join(', '), '\n');

async function run(book, ch) {
  const r = await fetch(`${BASE}/api/bible/generate`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ type: 'chapter-batch', bookId: book, chapter: ch }),
  });
  if (r.status === 409) return { ok: true, skipped: true };
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    return { ok: false, err: e.error ?? `HTTP ${r.status}` };
  }
  const d = await r.json();
  return { ok: true, passages: d.passages?.length ?? 0 };
}

let done = 0, ok = 0, skipped = 0, errors = 0;
const queue = [...tasks];
const t0 = Date.now();

const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const { book, ch } = queue.shift();
    const r = await run(book, ch).catch(e => ({ ok: false, err: e.message }));
    done++;
    if (r.skipped) { skipped++; process.stdout.write('s'); }
    else if (!r.ok) { errors++; process.stdout.write('✗'); console.error(`\n  ${book} ch${ch}: ${r.err}`); }
    else { ok++; process.stdout.write(`·`); }
    if (done % 8 === 0 || done === tasks.length) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      process.stdout.write(` ${done}/${tasks.length} (${elapsed}s)\n`);
    }
  }
});

await Promise.all(workers);

const elapsed = Math.round((Date.now() - t0) / 1000);
console.log(`\nGenerated: ${ok} ok, ${skipped} skipped, ${errors} errors — ${elapsed}s`);

// Publish all for the seeded books
console.log('\nPublishing...');
for (const { book } of specs) {
  const [nr, no, ni] = await Promise.all([
    fetch(`${BASE}/api/bible/study-notes/admin?bookId=${book}`, { headers: HEADERS })
      .then(r => r.json()).catch(() => []),
    fetch(`${BASE}/api/bible/chapter-overview/admin?bookId=${book}`, { headers: HEADERS })
      .then(r => r.json()).catch(() => []),
    fetch(`${BASE}/api/bible/book-intro/admin?bookId=${book}`, { headers: HEADERS })
      .then(r => r.json()).catch(() => []),
  ]);
  const passIds = nr.filter(n => n.status !== 'Published').map(n => n.id);
  if (passIds.length) {
    await fetch(`${BASE}/api/bible/study-notes/admin/bulk/status`, {
      method: 'PATCH', headers: HEADERS, body: JSON.stringify({ ids: passIds, status: 'Published' }),
    });
  }
  for (const ov of (no || [])) {
    if (ov.status !== 'Published') {
      await fetch(`${BASE}/api/bible/chapter-overview/admin/${ov.id}/status`, {
        method: 'PATCH', headers: HEADERS, body: JSON.stringify({ status: 'Published' }),
      });
    }
  }
  for (const intro of (ni || [])) {
    if (intro.status !== 'Published') {
      await fetch(`${BASE}/api/bible/book-intro/admin/${intro.id}/status`, {
        method: 'PATCH', headers: HEADERS, body: JSON.stringify({ status: 'Published' }),
      });
    }
  }
  console.log(`  ✓ ${book}: ${passIds.length} passages + overviews published`);
}
console.log('\nDone.');
