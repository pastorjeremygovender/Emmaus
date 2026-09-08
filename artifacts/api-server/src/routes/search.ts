import { Router } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { buildEmmausResourceCatalogue } from "../emmaus/resource-catalogue.js";

const router = Router();

export interface SearchResult {
  id: string;
  contentType: string;
  title: string;
  subtitle?: string;
  route: string;
  parentId?: string;
  stepNumber?: number;
}

const truncate = (s: string, len = 120) =>
  s.length > len ? s.slice(0, len) + "…" : s;

/**
 * Site search and Ask Emmaus intentionally consume the same live catalogue.
 * This prevents Search from exposing locked Daily Rhythm entries or unpublished
 * content that the conversation service correctly filters out.
 */
router.get("/search", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rawQuery = String(req.query.q ?? "").trim();
  if (rawQuery.length < 2) {
    res.json({ results: [], query: rawQuery });
    return;
  }

  try {
    const catalogue = await buildEmmausResourceCatalogue(rawQuery, undefined, undefined, userId);
    const results: SearchResult[] = catalogue.resources
      .filter((resource) => resource.relevance > 0 && resource.route.startsWith("/"))
      .map((resource) => ({
        id: resource.resourceId,
        contentType: resource.type,
        title: resource.title,
        subtitle: resource.description ? truncate(resource.description) : undefined,
        route: resource.route,
        parentId: resource.parentId,
      }))
      .filter((result, index, all) =>
        all.findIndex((candidate) => candidate.id === result.id && candidate.route === result.route) === index)
      .slice(0, 30);

    res.set("Cache-Control", "no-store");
    res.json({ results, query: rawQuery });
  } catch (err) {
    console.error("[search] Catalogue search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export { router as searchRouter };