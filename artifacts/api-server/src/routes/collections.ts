import { Router } from "express";
import { requireAuth } from "../emmaus/auth.js";
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  getJourneysInCollection,
} from "../lib/collections-store";

const router = Router();

// GET /api/collections
router.get("/collections", async (req, res) => {
  try {
    const collections = await listCollections();
    res.json({ collections });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

// GET /api/collections/:id
router.get("/collections/:id", async (req, res) => {
  try {
    const collection = await getCollection(String(req.params.id));
    if (!collection) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ collection });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch collection" });
  }
});

// GET /api/collections/:id/journeys
router.get("/collections/:id/journeys", async (req, res) => {
  try {
    const journeys = await getJourneysInCollection(String(req.params.id));
    res.json({ journeys });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch journeys" });
  }
});

// POST /api/collections
router.post("/collections", async (req, res) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    const { title, description, coverImageUrl, status, tags, displayOrder } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "Title is required" }); return;
    }
    const collection = await createCollection(
      { title: title.trim(), description, coverImageUrl, status, tags, displayOrder },
      userId
    );
    res.status(201).json({ collection });
  } catch (err) {
    res.status(500).json({ error: "Failed to create collection" });
  }
});

// PUT /api/collections/:id
router.put("/collections/:id", async (req, res) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    const { title, description, coverImageUrl, status, tags, displayOrder } = req.body;
    const collection = await updateCollection(
      String(req.params.id),
      { title, description, coverImageUrl, status, tags, displayOrder },
      userId
    );
    if (!collection) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ collection });
  } catch (err) {
    res.status(500).json({ error: "Failed to update collection" });
  }
});

// DELETE /api/collections/:id
router.delete("/collections/:id", async (req, res) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  try {
    const ok = await deleteCollection(String(req.params.id));
    if (!ok) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete collection" });
  }
});

export default router;
