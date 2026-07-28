/**
 * admin-sermon-store.ts — File-backed persistence for admin sermon draft records.
 *
 * Sermon drafts generated via the URL-first workflow are saved here server-side
 * so they survive browser refreshes, device changes, and localStorage clears.
 *
 * Storage: data/sermons/admin-drafts.json (atomic writes via temp→rename).
 * Schema matches the Sermon type in admin-demo-data.ts.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";

const DATA_DIR = join(process.cwd(), "data", "sermons");
const DRAFTS_FILE = join(DATA_DIR, "admin-drafts.json");

// ─── Sermon record type (mirrors frontend Sermon in admin-demo-data.ts) ────────

export interface AdminSermonRecord {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  youtubeUrl: string;
  summary?: string;
  topics: string[];
  keywords: string[];
  transcript?: string;
  sermonTranscript?: string;
  sermonStartTime?: string;
  sermonEndTime?: string;
  detectionConfidence?: number;
  detectionMethod?: "ai-auto" | "ai-confirmed" | "manual" | "none";
  transcriptStatus: "none" | "pending" | "complete";
  aiIndexStatus: "none" | "pending" | "indexed";
  companionJourneyId?: string;
  /** Pastor-confirmed one-sentence Big Idea */
  mainTheme?: string;
  status: "draft" | "review" | "published";
  pastorEdited: boolean;
  updatedAt: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function atomicWrite(data: AdminSermonRecord[]): Promise<void> {
  await ensureDir();
  const tmp = `${DRAFTS_FILE}.tmp.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, DRAFTS_FILE);
}

async function readAll(): Promise<AdminSermonRecord[]> {
  try {
    const raw = await readFile(DRAFTS_FILE, "utf-8");
    return JSON.parse(raw) as AdminSermonRecord[];
  } catch {
    return [];
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getAllAdminSermons(): Promise<AdminSermonRecord[]> {
  return readAll();
}

export async function getAdminSermonById(id: string): Promise<AdminSermonRecord | null> {
  const records = await readAll();
  return records.find(r => r.id === id) ?? null;
}

/**
 * Upsert a sermon record by id.
 * If a record with this id already exists, merges the patch onto it.
 * Returns the upserted record.
 */
export async function upsertAdminSermon(
  data: Omit<AdminSermonRecord, "createdAt"> & { createdAt?: string }
): Promise<AdminSermonRecord> {
  const records = await readAll();
  const idx = records.findIndex(r => r.id === data.id);
  const now = new Date().toISOString();

  if (idx >= 0) {
    const merged: AdminSermonRecord = {
      ...records[idx],
      ...data,
      createdAt: records[idx].createdAt, // never overwrite original creation time
      updatedAt: now,
    };
    records[idx] = merged;
    await atomicWrite(records);
    return merged;
  }

  const record: AdminSermonRecord = {
    ...data,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  records.push(record);
  await atomicWrite(records);
  return record;
}

/**
 * Permanently remove a sermon record by id.
 * Returns true if found and deleted, false if not found.
 */
export async function deleteAdminSermon(id: string): Promise<boolean> {
  const records = await readAll();
  const idx = records.findIndex(r => r.id === id);
  if (idx < 0) return false;
  records.splice(idx, 1);
  await atomicWrite(records);
  return true;
}

export async function updateAdminSermon(
  id: string,
  patch: Partial<Omit<AdminSermonRecord, "id" | "createdAt">>
): Promise<AdminSermonRecord | null> {
  const records = await readAll();
  const idx = records.findIndex(r => r.id === id);
  if (idx < 0) return null;

  const updated: AdminSermonRecord = {
    ...records[idx],
    ...patch,
    id, // never overwrite id
    updatedAt: new Date().toISOString(),
  };
  records[idx] = updated;
  await atomicWrite(records);
  return updated;
}
