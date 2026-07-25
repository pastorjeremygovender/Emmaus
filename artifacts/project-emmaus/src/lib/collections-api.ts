/**
 * Collections API client — used by both admin Content Studio and member Journeys pages.
 *
 * Admin routes:  GET/POST/PUT/DELETE /api/collections
 * Member routes: GET /api/collections (published only), GET /api/collections/:id/journeys
 */

import { getApiUrl } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Full Collection shape returned by all API endpoints. */
export interface Collection {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  status: string;
  tags: string[];
  displayOrder: number;
  journeyCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Alias used in member-facing contexts. */
export type CollectionSummary = Collection;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { userId?: string }
): Promise<T> {
  const { userId, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(userId ? { 'X-User-Id': userId } : {}),
  };
  const res = await fetch(getApiUrl(path), {
    credentials: 'include',
    headers,
    ...fetchOptions,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Collections API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** List all collections (admin: all statuses; member pages should filter client-side). */
export async function listCollections(): Promise<Collection[]> {
  const data = await apiFetch<{ collections: Collection[] }>('/api/collections');
  return data.collections ?? [];
}

/** Fetch a single collection by ID. Returns null if not found. */
export async function getCollection(id: string): Promise<Collection | null> {
  try {
    const data = await apiFetch<{ collection: Collection }>(`/api/collections/${id}`);
    return data.collection ?? null;
  } catch {
    return null;
  }
}

/** Fetch all journeys that belong to a collection. */
export async function getCollectionJourneys(collectionId: string): Promise<{ id: string; title: string }[]> {
  try {
    const data = await apiFetch<{ journeys: { id: string; title: string }[] }>(
      `/api/collections/${collectionId}/journeys`
    );
    return data.journeys ?? [];
  } catch {
    return [];
  }
}

// ─── Write (admin only) ───────────────────────────────────────────────────────

export interface CollectionPayload {
  title: string;
  description?: string;
  coverImageUrl?: string;
  status?: string;
  tags?: string[];
  displayOrder?: number;
}

export async function createCollection(
  payload: CollectionPayload,
  userId?: string
): Promise<Collection> {
  const data = await apiFetch<{ collection: Collection }>('/api/collections', {
    method: 'POST',
    body: JSON.stringify(payload),
    userId,
  });
  return data.collection;
}

export async function updateCollection(
  id: string,
  payload: Partial<CollectionPayload>,
  userId?: string
): Promise<Collection> {
  const data = await apiFetch<{ collection: Collection }>(`/api/collections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    userId,
  });
  return data.collection;
}

export async function deleteCollection(id: string, userId?: string): Promise<boolean> {
  const data = await apiFetch<{ deleted: boolean }>(`/api/collections/${id}`, {
    method: 'DELETE',
    userId,
  });
  return data.deleted ?? false;
}
