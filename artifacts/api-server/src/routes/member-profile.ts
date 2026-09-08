import { Router, type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { logger } from "../lib/logger.js";
import {
  getMemberProfile,
  updateMemberProfile,
  type IccMembership,
  type MemberProfilePatch,
} from "../lib/member-profile-store.js";

const router = Router();
const EDITABLE_FIELDS = [
  "preferredName",
  "contactNumber",
  "physicalAddress",
  "dateOfBirth",
  "iccMembership",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

router.get("/member/profile", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const profile = await getMemberProfile(userId);
    if (!profile) {
      res.status(409).json({ error: "The verified account profile is not ready." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(profile);
  } catch (err) {
    logger.error({ err, userId }, "member-profile: get failed");
    res.status(500).json({ error: "Could not load your personal details." });
  }
});

router.put("/member/profile", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Personal details must be sent as an object." });
    return;
  }
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some(key => !(EDITABLE_FIELDS as readonly string[]).includes(key))) {
    res.status(400).json({ error: "Only the supported personal details may be updated." });
    return;
  }

  const patch: MemberProfilePatch = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    const error = validateField(field, value);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    if (field === "preferredName") patch.preferredName = value.trim();
    else if (field === "contactNumber") patch.contactNumber = nullableString(value);
    else if (field === "physicalAddress") patch.physicalAddress = nullableString(value);
    else if (field === "dateOfBirth") patch.dateOfBirth = value || null;
    else patch.iccMembership = value || null;
  }

  try {
    const profile = await updateMemberProfile(userId, patch);
    if (!profile) {
      res.status(409).json({ error: "The verified account profile is not ready." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(profile);
  } catch (err) {
    logger.error({ err, userId }, "member-profile: update failed");
    res.status(500).json({ error: "Could not save your personal details." });
  }
});

function validateField(field: EditableField, value: unknown): string | null {
  if (field === "preferredName") {
    if (typeof value !== "string" || value.trim().length > 80) {
      return "Preferred name must be 80 characters or fewer.";
    }
    return null;
  }
  if (field === "contactNumber") {
    if (value !== null && typeof value !== "string") return "Enter a valid contact number.";
    if (typeof value === "string" && value.trim().length > 40) return "Contact number must be 40 characters or fewer.";
    if (typeof value === "string" && value.trim() && !/^[+()0-9 .-]+$/.test(value.trim())) {
      return "Enter a valid contact number.";
    }
    return null;
  }
  if (field === "physicalAddress") {
    if (value !== null && typeof value !== "string") return "Enter a valid physical address.";
    if (typeof value === "string" && value.trim().length > 300) return "Physical address must be 300 characters or fewer.";
    return null;
  }
  if (field === "dateOfBirth") {
    if (value === null || value === "") return null;
    if (typeof value !== "string" || !isValidBirthDate(value)) {
      return "Enter a valid date of birth.";
    }
    return null;
  }
  if (value === null || value === "") return null;
  if (value !== "yes" && value !== "no" && value !== "unsure") {
    return "Choose Yes, No, or I’m not sure for ICC membership.";
  }
  return null;
}

function nullableString(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getTime() <= todayUtc &&
    year >= 1900;
}

export default router;