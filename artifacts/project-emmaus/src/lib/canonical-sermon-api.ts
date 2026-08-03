/**
 * canonical-sermon-api.ts — Frontend client for the canonical Sermons API.
 *
 * All write endpoints (/admin/*) require admin role.
 * Read endpoints require auth only.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanonicalSermon {
  id: string;
  legacyJsonId: string | null;
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  scriptureReference: string;
  scriptureBookIds: string[];
  scriptureChapters: number[];
  youtubeUrl: string;
  youtubeVideoId: string;
  audioPath: string;
  notes: string;
  transcript: string;
  /** Full unabridged transcript (same as transcript for Whisper uploads). */
  fullTranscript?: string;
  transcriptStatus: "none" | "pending" | "complete";
  summary: string;
  themes: string[];
  sections: SermonSection[];
  keywords: string[];
  mainTheme: string;
  status: "Draft" | "Review" | "Published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Companion linkage (included in list responses)
  companionId?: string | null;
  // Set when this sermon's companion is the current week's sermon
  isCurrentWeek?: boolean;
}

export interface SermonSection {
  timestampSeconds: number;
  label: string;
  summary?: string;
}

// ─── List (admin) ─────────────────────────────────────────────────────────────

export async function listAdminSermons(): Promise<CanonicalSermon[]> {
  const res = await fetch(apiUrl("/sermons/admin"), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to load sermons: ${res.status}`);
  return res.json();
}

// ─── Get one (admin) ──────────────────────────────────────────────────────────

export async function getAdminSermon(id: string): Promise<CanonicalSermon> {
  const res = await fetch(apiUrl(`/sermons/admin/${id}`), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 404) throw new Error("Sermon not found");
  if (!res.ok) throw new Error(`Failed to load sermon: ${res.status}`);
  return res.json();
}

// ─── Create (admin) ───────────────────────────────────────────────────────────

export async function createAdminSermon(
  data: Partial<Omit<CanonicalSermon, "id" | "createdAt" | "updatedAt" | "publishedAt">>
): Promise<CanonicalSermon> {
  const res = await fetch(apiUrl("/sermons/admin"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Create failed: ${res.status}`);
  }
  return res.json();
}

// ─── Update (admin) ───────────────────────────────────────────────────────────

export async function updateAdminSermon(
  id: string,
  patch: Partial<Omit<CanonicalSermon, "id" | "createdAt">>
): Promise<CanonicalSermon> {
  const res = await fetch(apiUrl(`/sermons/admin/${id}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 404) throw new Error("Sermon not found");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Update failed: ${res.status}`);
  }
  return res.json();
}

// ─── Publish / Unpublish (admin) ─────────────────────────────────────────────

export async function publishAdminSermon(id: string): Promise<CanonicalSermon> {
  const res = await fetch(apiUrl(`/sermons/admin/${id}/publish`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 404) throw new Error("Sermon not found");
  if (!res.ok) throw new Error(`Publish failed: ${res.status}`);
  return res.json();
}

export async function unpublishAdminSermon(id: string): Promise<CanonicalSermon> {
  const res = await fetch(apiUrl(`/sermons/admin/${id}/unpublish`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 404) throw new Error("Sermon not found");
  if (!res.ok) throw new Error(`Unpublish failed: ${res.status}`);
  return res.json();
}

// ─── Delete (admin) ───────────────────────────────────────────────────────────

export async function deleteAdminSermon(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/sermons/admin/${id}`), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 404) throw new Error("Sermon not found");
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ─── Audio upload URL (admin) ─────────────────────────────────────────────────

export async function requestAudioUploadUrl(
  sermonId: string,
  file: { name: string; size: number; contentType: string }
): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(apiUrl(`/sermons/admin/${sermonId}/audio-upload-url`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(file),
  });
  if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);
  return res.json();
}

// ─── Transcribe audio (admin) ─────────────────────────────────────────────────
// Triggers Whisper transcription on the server for the uploaded audio file.
// Returns the updated sermon with transcript and transcriptStatus='complete'.

export async function transcribeSermonAudio(sermonId: string): Promise<CanonicalSermon> {
  const res = await fetch(apiUrl(`/sermons/admin/${sermonId}/transcribe`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "No audio uploaded");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Transcription failed: ${res.status}`);
  }
  return res.json();
}

// ─── Set current week (admin) ─────────────────────────────────────────────────
// Marks the companion of the given sermon as This Week's Sermon.
// Atomically clears the flag on all other companions (handled server-side).

export async function setCurrentWeekSermon(companionId: string): Promise<void> {
  const res = await fetch(apiUrl(`/sermon-companions/${companionId}/set-current-week`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Set current week failed: ${res.status}`);
  }
}

// ─── List published sermons (member) ─────────────────────────────────────────
// Used by Journeys.tsx to build the companionId → sermonId lookup map.

export async function listPublishedSermons(): Promise<CanonicalSermon[]> {
  const res = await fetch(apiUrl("/sermons"), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to load published sermons: ${res.status}`);
  return res.json();
}
