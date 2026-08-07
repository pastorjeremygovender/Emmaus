import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";

const router = Router();

interface SearchResult {
  id: string;
  contentType: string;
  title: string;
  subtitle?: string;
  route: string;
}

// GET /api/search?q=query — unified search across all content types
router.get("/search", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const query = String(req.query.q ?? "").trim();
  if (!query || query.length < 2) {
    res.json({ results: [], query });
    return;
  }
  const like = `%${query.toLowerCase()}%`;

  try {
    const [journeysRes, devotionalsRes, sermonsRes, companionsRes] =
      await Promise.all([
        pool.query(
          `SELECT id, title, description, journey_type
           FROM journeys
           WHERE status = 'Published'
             AND journey_type NOT IN ('core', 'daily-rhythm')
             AND (LOWER(title) LIKE $1 OR LOWER(COALESCE(description,'')) LIKE $1)
           ORDER BY CASE WHEN LOWER(title) LIKE $2 THEN 0 ELSE 1 END, title
           LIMIT 8`,
          [like, `${query.toLowerCase()}%`],
        ),
        pool.query(
          `SELECT id, title, description
           FROM devotional_series
           WHERE status = 'Published'
             AND (LOWER(title) LIKE $1 OR LOWER(COALESCE(description,'')) LIKE $1)
           ORDER BY CASE WHEN LOWER(title) LIKE $2 THEN 0 ELSE 1 END, title
           LIMIT 6`,
          [like, `${query.toLowerCase()}%`],
        ),
        pool.query(
          `SELECT id, title, speaker_name, scripture_references
           FROM sermons
           WHERE published_at IS NOT NULL AND deleted_at IS NULL
             AND (LOWER(title) LIKE $1
                  OR LOWER(COALESCE(speaker_name,'')) LIKE $1
                  OR LOWER(COALESCE(scripture_references,'')) LIKE $1)
           ORDER BY published_at DESC
           LIMIT 6`,
          [like],
        ),
        pool.query(
          `SELECT id, title, description
           FROM sermon_companion
           WHERE status = 'Published'
             AND (LOWER(title) LIKE $1 OR LOWER(COALESCE(description,'')) LIKE $1)
           ORDER BY published_at DESC NULLS LAST
           LIMIT 4`,
          [like],
        ),
      ]);

    const truncate = (s: string, len = 80) =>
      s.length > len ? s.slice(0, len) + "…" : s;

    interface JRow { id: unknown; title: unknown; description: unknown; journey_type: unknown }
    interface DRow { id: unknown; title: unknown; description: unknown }
    interface SRow { id: unknown; title: unknown; speaker_name: unknown; scripture_references: unknown }
    interface CRow { id: unknown; title: unknown; description: unknown }

    const results: SearchResult[] = [
      ...journeysRes.rows.map((r: JRow) => ({
        id: String(r.id),
        contentType: r.journey_type === "bible-study" ? "bible-study" : "journey",
        title: String(r.title),
        subtitle: r.description ? truncate(String(r.description)) : undefined,
        route: `/journeys/${r.id}`,
      })),
      ...devotionalsRes.rows.map((r: DRow) => ({
        id: String(r.id),
        contentType: "devotional",
        title: String(r.title),
        subtitle: r.description ? truncate(String(r.description)) : undefined,
        route: `/devotional/${r.id}/day/1`,
      })),
      ...sermonsRes.rows.map((r: SRow) => ({
        id: String(r.id),
        contentType: "sermon",
        title: String(r.title),
        subtitle: [r.speaker_name, r.scripture_references]
          .filter(Boolean)
          .map(String)
          .join(" · ") || undefined,
        route: `/sermon/${r.id}`,
      })),
      ...companionsRes.rows.map((r: CRow) => ({
        id: String(r.id),
        contentType: "sermon-companion",
        title: String(r.title),
        subtitle: r.description ? truncate(String(r.description)) : undefined,
        route: `/sermon-companion/${r.id}/overview`,
      })),
    ];

    res.json({ results, query });
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

export { router as searchRouter };
