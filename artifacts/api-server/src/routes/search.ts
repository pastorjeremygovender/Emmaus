import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";

const router = Router();

export interface SearchResult {
  id: string;
  contentType: string;
  title: string;
  subtitle?: string;
  route: string;
}

const truncate = (s: string, len = 80) =>
  s.length > len ? s.slice(0, len) + "…" : s;

// ─── GET /api/search?q= ───────────────────────────────────────────────────────
//
// Unified search across all published Emmaus content.
//
// Quality rules:
//  1. Each space-separated keyword is searched independently (OR logic within
//     each content type). "Jesus prayer" finds content matching "jesus" OR "prayer".
//  2. All journey types are searched (including daily-rhythm / core walks).
//  3. Companion entries are searched for body-level matches (e.g. "Gideon").
//  4. Results are ranked: title starts-with > title contains > body contains.
//
router.get("/search", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rawQuery = String(req.query.q ?? "").trim();
  if (!rawQuery || rawQuery.length < 2) {
    res.json({ results: [], query: rawQuery });
    return;
  }

  // Split into individual keywords for OR-matching; deduplicate and cap
  const keywords = Array.from(
    new Set(
      rawQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .slice(0, 6),
    ),
  );
  if (keywords.length === 0) {
    res.json({ results: [], query: rawQuery });
    return;
  }

  // Build a LIKE clause for any keyword: LOWER(col) LIKE ANY(ARRAY[$1,$2,...])
  const likePatterns = keywords.map((k) => `%${k}%`);

  // Dynamic placeholders: $1, $2, ... for each keyword LIKE pattern
  function anyLike(col: string, offset = 1): string {
    const refs = likePatterns.map((_, i) => `$${i + offset}`);
    return `${col} LIKE ANY(ARRAY[${refs.join(",")}]::text[])`;
  }

  // For starts-with ranking (first keyword)
  const firstLike = `%${keywords[0]}%`;
  const startsWithLike = `${keywords[0]}%`;

  try {
    interface JRow  { id: unknown; title: unknown; description: unknown; journey_type: unknown }
    interface DRow  { id: unknown; title: unknown; description: unknown }
    interface SRow  { id: unknown; title: unknown; speaker_name: unknown; scripture_references: unknown }
    interface CRow  { id: unknown; title: unknown; description: unknown }
    interface CERow { companion_id: unknown; companion_title: unknown; day_number: unknown; entry_title: unknown }

    const n = likePatterns.length;

    const [journeysRes, devotionalsRes, sermonsRes, companionsRes, companionEntriesRes] =
      await Promise.all([
        // Journeys — all types including daily-rhythm
        pool.query<JRow>(
          `SELECT id, title, description, journey_type
           FROM journeys
           WHERE status = 'Published'
             AND (
               ${anyLike("LOWER(title)", 1)}
               OR ${anyLike("LOWER(COALESCE(description,''))", 1)}
             )
           ORDER BY
             CASE WHEN LOWER(title) LIKE $${n + 1} THEN 0
                  WHEN LOWER(title) LIKE $${n + 2} THEN 1
                  ELSE 2 END,
             title
           LIMIT 10`,
          [...likePatterns, firstLike, startsWithLike],
        ),

        // Daily Devotionals
        pool.query<DRow>(
          `SELECT id, title, description
           FROM devotional_series
           WHERE status = 'Published'
             AND (
               ${anyLike("LOWER(title)", 1)}
               OR ${anyLike("LOWER(COALESCE(description,''))", 1)}
             )
           ORDER BY
             CASE WHEN LOWER(title) LIKE $${n + 1} THEN 0
                  WHEN LOWER(title) LIKE $${n + 2} THEN 1
                  ELSE 2 END,
             title
           LIMIT 8`,
          [...likePatterns, firstLike, startsWithLike],
        ),

        // Sermons
        pool.query<SRow>(
          `SELECT id, title, speaker_name, scripture_references
           FROM sermons
           WHERE published_at IS NOT NULL AND deleted_at IS NULL
             AND (
               ${anyLike("LOWER(title)", 1)}
               OR ${anyLike("LOWER(COALESCE(speaker_name,''))", 1)}
               OR ${anyLike("LOWER(COALESCE(scripture_references,''))", 1)}
             )
           ORDER BY published_at DESC
           LIMIT 8`,
          likePatterns,
        ),

        // Sermon Companions
        pool.query<CRow>(
          `SELECT id, title, description
           FROM sermon_companion
           WHERE status = 'Published'
             AND (
               ${anyLike("LOWER(title)", 1)}
               OR ${anyLike("LOWER(COALESCE(description,''))", 1)}
             )
           ORDER BY published_at DESC NULLS LAST
           LIMIT 6`,
          likePatterns,
        ),

        // Sermon Companion Entries — body-level match (e.g. "Gideon")
        // Returns unique companions not already matched by title
        pool.query<CERow>(
          `SELECT DISTINCT ON (sc.id)
             sc.id AS companion_id,
             sc.title AS companion_title,
             sce.day_number,
             sce.title AS entry_title
           FROM sermon_companion_entry sce
           JOIN sermon_companion sc ON sc.id = sce.companion_id
           WHERE sc.status = 'Published'
             AND sce.status = 'Published'
             AND (
               ${anyLike("LOWER(sce.content)", 1)}
               OR ${anyLike("LOWER(COALESCE(sce.reflection_prompt,''))", 1)}
             )
           ORDER BY sc.id, sce.day_number
           LIMIT 4`,
          likePatterns,
        ),
      ]);

    // Set of companion IDs already in the direct companion results
    const directCompanionIds = new Set(companionsRes.rows.map((r: CRow) => String(r.id)));

    const results: SearchResult[] = [
      // Journeys (all types)
      ...journeysRes.rows.map((r: JRow) => {
        const jt = String(r.journey_type);
        const contentType =
          jt === "bible-study" ? "bible-study" :
          jt === "daily-rhythm" || jt === "core" ? "daily-rhythm" :
          "journey";
        return {
          id: String(r.id),
          contentType,
          title: String(r.title),
          subtitle: r.description ? truncate(String(r.description)) : undefined,
          route: `/journeys/${r.id}`,
        };
      }),

      // Daily Devotionals
      ...devotionalsRes.rows.map((r: DRow) => ({
        id: String(r.id),
        contentType: "devotional",
        title: String(r.title),
        subtitle: r.description ? truncate(String(r.description)) : undefined,
        route: `/devotional/${r.id}/day/1`,
      })),

      // Sermons
      ...sermonsRes.rows.map((r: SRow) => ({
        id: String(r.id),
        contentType: "sermon",
        title: String(r.title),
        subtitle: [r.speaker_name, r.scripture_references].filter(Boolean).map(String).join(" · ") || undefined,
        route: `/sermon/${r.id}`,
      })),

      // Sermon Companions (title match)
      ...companionsRes.rows.map((r: CRow) => ({
        id: String(r.id),
        contentType: "sermon-companion",
        title: String(r.title),
        subtitle: r.description ? truncate(String(r.description)) : undefined,
        route: `/sermon-companion/${r.id}/overview`,
      })),

      // Sermon Companions found via body text (exclude those already in title results)
      ...companionEntriesRes.rows
        .filter((r: CERow) => !directCompanionIds.has(String(r.companion_id)))
        .map((r: CERow) => ({
          id: String(r.companion_id),
          contentType: "sermon-companion",
          title: String(r.companion_title),
          subtitle: `Day ${r.day_number}: ${truncate(String(r.entry_title), 60)}`,
          route: `/sermon-companion/${r.companion_id}/overview`,
        })),
    ];

    res.json({ results, query: rawQuery });
  } catch (err) {
    console.error("[search] Error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export { router as searchRouter };
