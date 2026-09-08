/**
 * content-groups-api.ts — frontend client for Content Group endpoints.
 *
 * Endpoint contract: /api/content-groups
 *
 * GET    /api/content-groups
 *   → { groups: ContentGroup[] }
 *
 * POST   /api/content-groups
 *   body: { title, description?, coverImageUrl?, status?, displayOrder? }
 *   → { group: ContentGroup }
 *
 * GET    /api/content-groups/:id
 *   → { group: ContentGroupDetail }
 *   Note: items[] contains raw { targetType, targetId, displayOrder } only —
 *         no resolved title/status from the server.
 *
 * PUT    /api/content-groups/:id
 *   body: { title?, description?, coverImageUrl?, status?, displayOrder? }
 *   → { group: ContentGroup }
 *
 * DELETE /api/content-groups/:id
 *   → { deleted: boolean }
 *   Note: does NOT delete the underlying content items.
 *
 * PUT    /api/content-groups/:id/items
 *   body: { items: [{ targetType, targetId }] }
 *   displayOrder is derived server-side from array position.
 *   → { items: ContentGroupItem[] }
 *
 * GET    /api/content-groups/by-target/:targetType/:targetId
 *   → { groups: ContentGroup[] }
 *
 * targetType values: 'journey' | 'daily-rhythm' | 'daily-devotional'
 */

import { getApiUrl } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Discriminator values exactly as the backend expects them. */
export type ContentGroupTargetType = 'journey' | 'daily-rhythm' | 'daily-devotional';

/** Raw item shape returned by GET /api/content-groups/:id — no resolved metadata. */
export interface ContentGroupItem {
  targetType: ContentGroupTargetType;
  targetId: string;
  displayOrder: number;
}

export interface ContentGroup {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  status: string;
  displayOrder: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentGroupDetail extends ContentGroup {
  items: ContentGroupItem[];
}

export interface ContentGroupPayload {
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status?: string;
  displayOrder?: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Content Groups API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Group CRUD ───────────────────────────────────────────────────────────────

/** List all groups (admin — all statuses). */
export async function listContentGroups(): Promise<ContentGroup[]> {
  const data = await apiFetch<{ groups: ContentGroup[] }>('/api/content-groups');
  return data.groups ?? [];
}

/** Fetch a single group with its raw item list. */
export async function getContentGroup(id: string): Promise<ContentGroupDetail> {
  const data = await apiFetch<{ group: ContentGroupDetail }>(`/api/content-groups/${id}`);
  return data.group;
}

/** Create a new group. */
export async function createContentGroup(payload: ContentGroupPayload): Promise<ContentGroup> {
  const data = await apiFetch<{ group: ContentGroup }>('/api/content-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.group;
}

/** Update group metadata (does not affect items). */
export async function updateContentGroup(
  id: string,
  payload: Partial<ContentGroupPayload>,
): Promise<ContentGroup> {
  const data = await apiFetch<{ group: ContentGroup }>(`/api/content-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return data.group;
}

/**
 * Permanently delete a group.
 * The underlying content items (journeys, series, etc.) are NOT deleted.
 */
export async function deleteContentGroup(id: string): Promise<boolean> {
  const data = await apiFetch<{ deleted: boolean }>(`/api/content-groups/${id}`, {
    method: 'DELETE',
  });
  return data.deleted ?? false;
}

// ─── Items / Membership ───────────────────────────────────────────────────────

/**
 * Replace the full ordered items list for a group.
 *
 * PUT /api/content-groups/:id/items
 * Body: { items: [{ targetType, targetId }] }
 * displayOrder is derived server-side from array position.
 * Returns: { items: ContentGroupItem[] }
 */
export async function setContentGroupItems(
  groupId: string,
  items: { targetType: ContentGroupTargetType; targetId: string }[],
): Promise<ContentGroupItem[]> {
  const data = await apiFetch<{ items: ContentGroupItem[] }>(
    `/api/content-groups/${groupId}/items`,
    {
      method: 'PUT',
      body: JSON.stringify({ items }),
    },
  );
  return data.items ?? [];
}

/**
 * Fetch all groups that a specific content item belongs to.
 *
 * GET /api/content-groups/by-target/:targetType/:targetId
 * Returns: { groups: ContentGroup[] }
 */
export async function getGroupsByTarget(
  targetType: ContentGroupTargetType,
  targetId: string,
): Promise<ContentGroup[]> {
  const data = await apiFetch<{ groups: ContentGroup[] }>(
    `/api/content-groups/by-target/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`,
  );
  return data.groups ?? [];
}
