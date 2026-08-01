"""
enrich-study-notes.py

Generates key_truth, reflection_question, and related_scriptures for every
study note in bible-study-notes-seed.json that is currently missing them.

Steps:
  1. Load the seed JSON
  2. Call OpenAI (gpt-4o-mini) in parallel threads
  3. Write the enriched JSON back to disk
  4. Generate a SQL patch file and apply it via psql

Usage: python3 artifacts/api-server/scripts/enrich-study-notes.py
"""

import json, os, sys, time, subprocess, threading, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

SEED_PATH = Path(__file__).parent.parent / "src/data/bible-study-notes-seed.json"
SQL_PATH  = Path(__file__).parent / "enrich-patch.sql"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
DATABASE_URL   = os.environ.get("DATABASE_URL", "")

if not OPENAI_API_KEY:
    sys.exit("OPENAI_API_KEY not set")
if not DATABASE_URL:
    sys.exit("DATABASE_URL not set")

BOOK_NAMES = {
    "genesis":"Genesis","exodus":"Exodus","leviticus":"Leviticus","numbers":"Numbers",
    "deuteronomy":"Deuteronomy","joshua":"Joshua","judges":"Judges","ruth":"Ruth",
    "1samuel":"1 Samuel","2samuel":"2 Samuel","1kings":"1 Kings","2kings":"2 Kings",
    "1chronicles":"1 Chronicles","2chronicles":"2 Chronicles","ezra":"Ezra",
    "nehemiah":"Nehemiah","esther":"Esther","job":"Job","psalms":"Psalms",
    "proverbs":"Proverbs","ecclesiastes":"Ecclesiastes","songofsolomon":"Song of Solomon",
    "isaiah":"Isaiah","jeremiah":"Jeremiah","lamentations":"Lamentations","ezekiel":"Ezekiel",
    "daniel":"Daniel","hosea":"Hosea","joel":"Joel","amos":"Amos","obadiah":"Obadiah",
    "jonah":"Jonah","micah":"Micah","nahum":"Nahum","habakkuk":"Habakkuk",
    "zephaniah":"Zephaniah","haggai":"Haggai","zechariah":"Zechariah","malachi":"Malachi",
    "matthew":"Matthew","mark":"Mark","luke":"Luke","john":"John","acts":"Acts",
    "romans":"Romans","1corinthians":"1 Corinthians","2corinthians":"2 Corinthians",
    "galatians":"Galatians","ephesians":"Ephesians","philippians":"Philippians",
    "colossians":"Colossians","1thessalonians":"1 Thessalonians","2thessalonians":"2 Thessalonians",
    "1timothy":"1 Timothy","2timothy":"2 Timothy","titus":"Titus","philemon":"Philemon",
    "hebrews":"Hebrews","james":"James","1peter":"1 Peter","2peter":"2 Peter",
    "1john":"1 John","2john":"2 John","3john":"3 John","jude":"Jude","revelation":"Revelation",
}

print_lock = threading.Lock()
counter = {"done": 0, "failed": 0}

def log(msg):
    with print_lock:
        print(msg, flush=True)


def openai_chat(messages, max_tokens=400, retries=5):
    payload = json.dumps({
        "model": "gpt-4o-mini",
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }).encode()

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=payload,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.load(resp)
                return body["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            status = e.code
            if status == 429 or status >= 500:
                wait = 2 ** attempt
                log(f"  HTTP {status} — retrying in {wait}s (attempt {attempt+1}/{retries})")
                time.sleep(wait)
            else:
                raise
        except Exception as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            log(f"  Error {e} — retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError("Max retries exceeded")


def generate_fields(note):
    book_id    = note["book_id"]
    book_name  = BOOK_NAMES.get(book_id, book_id)
    verse_end  = note.get("verse_end")
    verse_start = note["verse_start"]
    verse_range = f"{verse_start}–{verse_end}" if verse_end and verse_end != verse_start else str(verse_start)
    ref         = f"{book_name} {note['chapter']}:{verse_range}"

    content       = (note.get("content") or "")[:800]
    jesus_conn    = (note.get("jesus_connection") or "")[:300]
    apply_it      = (note.get("apply_it") or "")[:300]
    context_note  = (note.get("context_note") or "")[:300]

    prompt = f"""You are a biblical scholar writing concise study content for a Christian discipleship app.

Passage: {ref} — "{note.get('title','')}"

EXISTING CONTENT:
Explanation: {content}
Context: {context_note}
Jesus Connection: {jesus_conn}
Apply It: {apply_it}

Generate ONLY a JSON object with exactly these three fields:
{{
  "key_truth": "One clear memorable sentence stating the central truth of this passage (not a question, not a list — a definitive theological statement of 15–30 words).",
  "reflection_question": "One probing personal question that invites the reader to examine their own heart or life in light of this passage. Start with Where, How, What, or When. No bullet points. One sentence ending with a question mark.",
  "related_scriptures": "3–5 Bible references that illuminate the same theme, comma-separated (e.g. John 3:16, Romans 5:8, Ephesians 2:8-9). Do NOT include the passage itself."
}}

Return ONLY valid JSON, no markdown, no explanation outside the JSON object."""

    raw = openai_chat([{"role": "user", "content": prompt}])
    parsed = json.loads(raw)

    kt = str(parsed.get("key_truth", "")).strip()
    rq = str(parsed.get("reflection_question", "")).strip()
    rs = str(parsed.get("related_scriptures", "")).strip()

    if not kt or not rq or not rs:
        raise ValueError(f"Incomplete fields for {ref}: {parsed}")

    return {"key_truth": kt, "reflection_question": rq, "related_scriptures": rs}


def process_note(note, idx, total):
    key = f"{note['book_id']}:{note['chapter']}:{note['verse_start']}"
    try:
        fields = generate_fields(note)
        with print_lock:
            counter["done"] += 1
            done = counter["done"]
            if done % 50 == 0 or done == total:
                pct = round(done / total * 100)
                print(f"  Progress: {done}/{total} ({pct}%)", flush=True)
        return key, fields
    except Exception as e:
        log(f"  FAILED {key}: {e}")
        with print_lock:
            counter["failed"] += 1
        return key, None


def sql_escape(s):
    return s.replace("'", "''")


def main():
    notes = json.loads(SEED_PATH.read_text())
    print(f"Loaded {len(notes)} notes from seed JSON")

    to_enrich = [
        n for n in notes
        if not (n.get("key_truth") or "").strip()
        or not (n.get("reflection_question") or "").strip()
        or not (n.get("related_scriptures") or "").strip()
    ]
    print(f"{len(to_enrich)} notes need enrichment")

    if not to_enrich:
        print("Nothing to do — all notes already have the three fields.")
        return

    # ── 1. Generate in parallel ──────────────────────────────────────────────
    enriched = {}
    total = len(to_enrich)

    with ThreadPoolExecutor(max_workers=15) as pool:
        futures = {
            pool.submit(process_note, note, idx, total): idx
            for idx, note in enumerate(to_enrich)
        }
        for future in as_completed(futures):
            key, fields = future.result()
            if fields:
                enriched[key] = fields

    print(f"\nGeneration complete: {len(enriched)} succeeded, {counter['failed']} failed")

    # ── 2. Update seed JSON ──────────────────────────────────────────────────
    for note in notes:
        key = f"{note['book_id']}:{note['chapter']}:{note['verse_start']}"
        if key in enriched:
            note["key_truth"]           = enriched[key]["key_truth"]
            note["reflection_question"] = enriched[key]["reflection_question"]
            note["related_scriptures"]  = enriched[key]["related_scriptures"]

    SEED_PATH.write_text(json.dumps(notes, indent=2))
    print(f"Seed JSON updated: {SEED_PATH}")

    # ── 3. Generate SQL patch ────────────────────────────────────────────────
    # We match by book_id + chapter + verse_start (same composite key used in seeding)
    sql_lines = ["BEGIN;"]
    for key, fields in enriched.items():
        book_id, chapter, verse_start = key.split(":")
        kt = sql_escape(fields["key_truth"])
        rq = sql_escape(fields["reflection_question"])
        rs = sql_escape(fields["related_scriptures"])
        sql_lines.append(
            f"UPDATE bible_study_notes "
            f"SET key_truth='{kt}', reflection_question='{rq}', related_scriptures='{rs}', updated_at=now() "
            f"WHERE book_id='{book_id}' AND chapter={chapter} AND verse_start={verse_start} "
            f"AND (key_truth IS NULL OR key_truth='');"
        )
    sql_lines.append("COMMIT;")
    SQL_PATH.write_text("\n".join(sql_lines))
    print(f"SQL patch written: {SQL_PATH} ({len(enriched)} statements)")

    # ── 4. Apply SQL via psql ────────────────────────────────────────────────
    print("Applying SQL patch to database…")
    result = subprocess.run(
        ["psql", DATABASE_URL, "-f", str(SQL_PATH), "-v", "ON_ERROR_STOP=1"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("psql stderr:", result.stderr[:500])
        sys.exit(f"psql failed (exit {result.returncode})")

    print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
    print("Database patched successfully.")

    # ── 5. Summary ───────────────────────────────────────────────────────────
    filled = sum(1 for n in notes if (n.get("key_truth") or "").strip())
    missing = [n for n in notes if not (n.get("key_truth") or "").strip()]
    print(f"\n✓ Done. {filled}/{len(notes)} notes now have key_truth.")
    if missing:
        print(f"Still missing ({len(missing)}):")
        for n in missing:
            print(f"  {n['book_id']} {n['chapter']}:{n['verse_start']}")


if __name__ == "__main__":
    main()
