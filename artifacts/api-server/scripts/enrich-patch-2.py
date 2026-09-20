"""Patch the 2 notes that failed in the main run."""
import json, os, subprocess, urllib.request, time
from pathlib import Path

SEED_PATH = Path(__file__).parent.parent / "src/data/bible-study-notes-seed.json"
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
DATABASE_URL   = os.environ["DATABASE_URL"]

FIXES = {
    ("psalms", 116, 1): {
        "key_truth":           "Because God inclines His ear to hear our cries, calling on Him in every crisis is the wisest and most faithful response we can make.",
        "reflection_question": "Where in your life right now do you need to cry out to God and trust that He is inclining His ear toward you?",
        "related_scriptures":  "Psalm 18:6, Lamentations 3:55-57, Matthew 7:7-8, Romans 8:26",
    },
    ("psalms", 119, 161): {
        "key_truth":           "Those who love God's word find a deep, unshakeable peace that sustains them even when powerful opponents oppose them without cause.",
        "reflection_question": "How does your love for God's word shape your response when you face opposition or pressure from others?",
        "related_scriptures":  "Philippians 4:7, Psalm 119:165, John 16:33, Isaiah 26:3",
    },
}

notes = json.loads(SEED_PATH.read_text())

sql_parts = ["BEGIN;"]
for note in notes:
    key = (note["book_id"], note["chapter"], note["verse_start"])
    if key in FIXES:
        f = FIXES[key]
        note["key_truth"]           = f["key_truth"]
        note["reflection_question"] = f["reflection_question"]
        note["related_scriptures"]  = f["related_scriptures"]

        def esc(s): return s.replace("'", "''")
        sql_parts.append(
            f"UPDATE bible_study_notes "
            f"SET key_truth='{esc(f['key_truth'])}', reflection_question='{esc(f['reflection_question'])}', related_scriptures='{esc(f['related_scriptures'])}', updated_at=now() "
            f"WHERE book_id='{key[0]}' AND chapter={key[1]} AND verse_start={key[2]};"
        )
        print(f"Prepared fix for {key}")

sql_parts.append("COMMIT;")

SEED_PATH.write_text(json.dumps(notes, indent=2))
print("Seed JSON updated.")

sql_path = Path(__file__).parent / "enrich-patch-2.sql"
sql_path.write_text("\n".join(sql_parts))

result = subprocess.run(
    ["psql", DATABASE_URL, "-f", str(sql_path), "-v", "ON_ERROR_STOP=1"],
    capture_output=True, text=True
)
if result.returncode != 0:
    print("psql stderr:", result.stderr)
    raise SystemExit("psql failed")

print(result.stdout)
print("Done — 2 remaining notes patched.")

# Verify
filled = sum(1 for n in notes if (n.get("key_truth") or "").strip())
print(f"Total notes with key_truth: {filled}/{len(notes)}")
