import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../emmaus/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import OpenAI from "openai";

const router = Router();
const objectStorageService = new ObjectStorageService();
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const TYPES = new Set(["accurate-visual", "artistic-scene", "upload"]);
const TEMPLATES = new Set(["bible-map", "timeline", "book-outline", "journey-route", "teaching-diagram", "comparison", "people-groups", "custom-diagram"]);
const STATUSES = new Set(["Suggested", "Generating", "Draft", "Approved", "Failed"]);
const PLACEMENTS = new Set(["below-scripture", "below-welcome", "within-reflection", "after-reflection", "before-consider-this"]);

function clean(value: unknown, max = 5000): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}

function safeStructuredData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 50_000) throw new Error("Structured visual data is too large");
  return value as Record<string, unknown>;
}

function renderSvg(template: string, data: Record<string, unknown>): string {
  const title = clean(data.title, 160) ?? "Emmaus teaching visual";
  const items = Array.isArray(data.items) ? data.items.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const nodes = items.map((item, i) => {
    const x = 80 + (i % 3) * 220;
    const y = 180 + Math.floor(i / 3) * 86;
    return `<g><rect x="${x}" y="${y}" width="190" height="54" rx="14" fill="#E7F5F1" stroke="#0F766E"/><text x="${x + 95}" y="${y + 32}" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#134E4A">${esc(item)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 520" role="img" aria-labelledby="title"><title id="title">${esc(title)}</title><rect width="820" height="520" fill="#FFFEFB"/><text x="410" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#123B35">${esc(title)}</text>${nodes}</svg>`;
}

function publicFields(row: Record<string, unknown>) {
  return {
    id: row.id, contentType: row.content_type, contentId: row.content_id, stepId: row.step_id,
    illustrationType: row.illustration_type, templateType: row.template_type,
    sourceSvg: row.source_svg, displayObjectPath: row.display_object_path,
    thumbnailObjectPath: row.thumbnail_object_path, caption: row.caption,
    alternativeText: row.alternative_text, placement: row.placement,
    paragraphPosition: row.paragraph_position, status: row.status,
    generationInstruction: row.generation_instruction, structuredData: row.structured_data,
    adminNote: row.admin_note, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const ARTISTIC_STYLES = {
  "dark-cinematic": "dark cinematic editorial photography, dramatic directional light, rich shadows, restrained colour",
  "light-floral": "light airy editorial illustration, gentle daylight, soft natural colour, subtle botanical detail only when relevant",
  "in-the-middle": "balanced contemporary editorial illustration, emotionally specific, varied colour and generous negative space",
} as const;
type ArtisticStyle = keyof typeof ARTISTIC_STYLES;

async function generateArtisticScene(id: string, instruction: string, style: ArtisticStyle, altText: string) {
  try {
    if (!openai) throw new Error("Image generation is not configured");
    const prompt = [
      "Create a single safe, respectful artistic scene for a Christian devotional illustration.",
      "Follow the administrator's instruction literally, without adding readable text, captions, logos, or watermarks.",
      `Visual style: ${ARTISTIC_STYLES[style]}.`,
      `Administrator instruction: ${instruction}`,
      `Accessibility subject description: ${altText}`,
      "Use original imagery only. Avoid graphic violence, sexual content, hateful symbols, and identifiable private people.",
    ].join("\n");
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "high",
      n: 1,
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error("The image provider returned no image");
    const bytes = Buffer.from(encoded, "base64");
    const displayPath = await objectStorageService.uploadObjectEntityBuffer(bytes, "image/png", "illustrations");
    const thumbnailPath = await objectStorageService.uploadObjectEntityBuffer(bytes, "image/png", "illustrations/thumbnails");
    const result = await pool.query(
      `UPDATE illustrations
       SET display_object_path=$1, thumbnail_object_path=$2,
           structured_data = COALESCE(structured_data, '{}'::jsonb) || $3::jsonb,
           status='Draft', approved_by=NULL, approved_at=NULL, updated_at=NOW()
       WHERE id=$4 AND status='Generating' RETURNING *`,
      [displayPath, thumbnailPath, JSON.stringify({ style, model: "gpt-image-1", generatedAt: new Date().toISOString() }), id],
    );
    return result.rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    await pool.query(
      `UPDATE illustrations SET status='Failed', admin_note=$1, updated_at=NOW()
       WHERE id=$2 AND status='Generating'`,
      [message.slice(0, 5000), id],
    );
    return null;
  }
}

router.get("/illustrations", async (req: Request, res: Response) => {
  const contentType = clean(req.query.contentType, 60);
  const contentId = clean(req.query.contentId, 200);
  const stepId = clean(req.query.stepId, 200);
  if (!contentType || !contentId) return res.status(400).json({ error: "contentType and contentId are required" });
  const values: string[] = [contentType, contentId];
  const extra = stepId ? " AND step_id = $3" : "";
  if (stepId) values.push(stepId);
  const result = await pool.query(`SELECT * FROM illustrations WHERE content_type=$1 AND content_id=$2${extra} AND status='Approved' ORDER BY created_at DESC`, values);
  res.json(result.rows.map(publicFields));
});

router.get("/illustrations/admin", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const result = await pool.query("SELECT * FROM illustrations ORDER BY updated_at DESC");
  res.json(result.rows.map((row) => ({ ...publicFields(row), generationInstruction: row.generation_instruction, structuredData: row.structured_data, adminNote: row.admin_note, createdBy: row.created_by, approvedBy: row.approved_by, approvedAt: row.approved_at, createdAt: row.created_at, updatedAt: row.updated_at })));
});

router.post("/illustrations", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const body = req.body ?? {};
  const contentType = clean(body.contentType, 60), contentId = clean(body.contentId, 200);
  const illustrationType = clean(body.illustrationType, 40);
  if (!contentType || !contentId || !illustrationType || !TYPES.has(illustrationType)) return res.status(400).json({ error: "Invalid illustration details" });
  const templateType = clean(body.templateType, 60);
  if (illustrationType === "accurate-visual" && (!templateType || !TEMPLATES.has(templateType))) return res.status(400).json({ error: "A valid Accurate Visual template is required" });
  const placement = clean(body.placement, 60) ?? "after-reflection";
  if (!PLACEMENTS.has(placement)) return res.status(400).json({ error: "Invalid placement" });
  let structuredData: Record<string, unknown>;
  try { structuredData = safeStructuredData(body.structuredData); } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  const sourceSvg = illustrationType === "accurate-visual" ? renderSvg(templateType!, structuredData) : clean(body.sourceSvg, 200_000);
  const result = await pool.query(
    `INSERT INTO illustrations (content_type,content_id,step_id,illustration_type,template_type,source_svg,display_object_path,thumbnail_object_path,generation_instruction,structured_data,caption,alternative_text,admin_note,placement,paragraph_position,status,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Draft',$16) RETURNING *`,
    [contentType, contentId, clean(body.stepId, 200), illustrationType, templateType, sourceSvg, clean(body.displayObjectPath, 500), clean(body.thumbnailObjectPath, 500), clean(body.generationInstruction, 5000), structuredData, clean(body.caption, 500), clean(body.alternativeText, 500) ?? "", clean(body.adminNote, 5000), placement, Number.isInteger(body.paragraphPosition) ? body.paragraphPosition : null, userId],
  );
  res.status(201).json(publicFields(result.rows[0]));
});

router.patch("/illustrations/:id", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const id = String(req.params.id);
  const body = req.body ?? {};
  const fields: string[] = [], values: unknown[] = [];
  const add = (column: string, value: unknown) => { fields.push(`${column}=$${values.length + 1}`); values.push(value); };
  for (const [key, column] of [["caption","caption"],["alternativeText","alternative_text"],["adminNote","admin_note"],["generationInstruction","generation_instruction"],["displayObjectPath","display_object_path"],["thumbnailObjectPath","thumbnail_object_path"]] as const) if (body[key] !== undefined) add(column, clean(body[key], 5000));
  if (body.placement !== undefined && PLACEMENTS.has(String(body.placement))) add("placement", String(body.placement));
  if (body.structuredData !== undefined) { try { add("structured_data", safeStructuredData(body.structuredData)); } catch { return res.status(400).json({ error: "Invalid structured data" }); } }
  if (body.templateType && TEMPLATES.has(String(body.templateType))) { add("template_type", String(body.templateType)); if (body.sourceSvg === undefined) add("source_svg", renderSvg(String(body.templateType), safeStructuredData(body.structuredData))); }
  if (!fields.length) return res.status(400).json({ error: "No editable fields supplied" });
  add("updated_at", new Date());
  values.push(id);
  const result = await pool.query(`UPDATE illustrations SET ${fields.join(",")} WHERE id=$${values.length} RETURNING *`, values);
  if (!result.rowCount) return res.status(404).json({ error: "Illustration not found" });
  res.json(publicFields(result.rows[0]));
});

router.post("/illustrations/:id/approve", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const result = await pool.query("UPDATE illustrations SET status='Approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *", [userId, String(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: "Illustration not found" });
  res.json(publicFields(result.rows[0]));
});

router.post("/illustrations/:id/unapprove", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const result = await pool.query("UPDATE illustrations SET status='Draft', approved_by=NULL, approved_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *", [String(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: "Illustration not found" });
  res.json(publicFields(result.rows[0]));
});

router.post("/illustrations/upload-url", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const contentType = clean(req.body?.contentType, 120);
  if (!contentType || !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(contentType)) {
    return res.status(400).json({ error: "Only PNG, JPEG, WebP, or SVG uploads are supported" });
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL, objectPath: objectStorageService.normalizeObjectEntityPath(uploadURL) });
  } catch { res.status(500).json({ error: "Could not prepare secure upload" }); }
});

router.post("/illustrations/:id/generate", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const id = String(req.params.id);
  const instruction = clean(req.body?.instruction, 3000);
  const style = clean(req.body?.style, 40) as ArtisticStyle | null;
  if (!instruction || !style || !(style in ARTISTIC_STYLES)) {
    return res.status(400).json({ error: "A clear instruction and valid Artistic Scene style are required" });
  }
  const claimed = await pool.query(
    `UPDATE illustrations
     SET status='Generating', generation_instruction=$1, admin_note=NULL,
         approved_by=NULL, approved_at=NULL, updated_at=NOW()
     WHERE id=$2 AND illustration_type='artistic-scene' AND status <> 'Generating'
     RETURNING *`,
    [instruction, id],
  );
  if (!claimed.rowCount) {
    const current = await pool.query("SELECT * FROM illustrations WHERE id=$1", [id]);
    if (!current.rowCount) return res.status(404).json({ error: "Illustration not found" });
    if (current.rows[0].status === "Generating") return res.status(409).json({ error: "Generation is already in progress" });
    return res.status(400).json({ error: "Only Artistic Scenes can be generated" });
  }
  const row = claimed.rows[0];
  void generateArtisticScene(id, instruction, style, String(row.alternative_text ?? ""));
  res.status(202).json(publicFields(row));
});

router.post("/illustrations/:id/regenerate", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const current = await pool.query("SELECT * FROM illustrations WHERE id=$1", [String(req.params.id)]);
  if (!current.rowCount) return res.status(404).json({ error: "Illustration not found" });
  const row = current.rows[0];
  if (row.illustration_type === "artistic-scene") {
    const instruction = clean(req.body?.instruction, 3000) ?? row.generation_instruction;
    const style = (clean(req.body?.style, 40) ?? (row.structured_data?.style as string)) as ArtisticStyle | null;
    if (!instruction || !style || !(style in ARTISTIC_STYLES)) return res.status(400).json({ error: "A clear instruction and valid Artistic Scene style are required" });
    const claimed = await pool.query(
      `UPDATE illustrations SET status='Generating', generation_instruction=$1, admin_note=NULL,
       approved_by=NULL, approved_at=NULL, updated_at=NOW()
       WHERE id=$2 AND status <> 'Generating' RETURNING *`, [instruction, String(req.params.id)],
    );
    if (!claimed.rowCount) return res.status(409).json({ error: "Generation is already in progress" });
    void generateArtisticScene(String(req.params.id), instruction, style, String(row.alternative_text ?? ""));
    return res.status(202).json(publicFields(claimed.rows[0]));
  }
  if (row.illustration_type !== "accurate-visual" || !row.template_type) return res.status(400).json({ error: "Only Accurate Visuals or Artistic Scenes can be regenerated" });
  const sourceSvg = renderSvg(row.template_type, safeStructuredData(row.structured_data));
  const result = await pool.query("UPDATE illustrations SET source_svg=$1, status='Draft', approved_by=NULL, approved_at=NULL, updated_at=NOW() WHERE id=$2 RETURNING *", [sourceSvg, String(req.params.id)]);
  res.json(publicFields(result.rows[0]));
});

router.delete("/illustrations/:id", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res); if (!userId) return;
  const result = await pool.query("DELETE FROM illustrations WHERE id=$1 RETURNING id", [String(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: "Illustration not found" });
  res.status(204).end();
});

export default router;