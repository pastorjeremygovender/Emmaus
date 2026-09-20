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
  publishedJourneyCount: number;
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
  const { userId: _userId, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const res = await fetch(getApiUrl(path), {
    credentials: 'include',
    // Collection visibility and membership are part of the authenticated
    // discovery experience; avoid body-less 304 responses.
    cache: 'no-store',
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

/** Fetch all journeys that belong to a collection (id + title summary only). */
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

/**
 * Fetch full journey records for a collection.
 * Returns the same shape as /api/collections/:id/journeys so all fields
 * (collectionId, status, journeyType, etc.) are available for display.
 */
export async function listCollectionJourneys(collectionId: string): Promise<CollectionJourney[]> {
  try {
    const data = await apiFetch<{ journeys: CollectionJourney[] }>(
      `/api/collections/${collectionId}/journeys`
    );
    return data.journeys ?? [];
  } catch {
    return [];
  }
}

/** Full journey record returned by /api/collections/:id/journeys */
export interface CollectionJourney {
  id: string;
  title: string;
  description?: string;
  journeyType?: string;
  status?: string;
  durationDays?: number;
  estimatedDuration?: string;
  difficulty?: string;
  tags?: string[];
  collectionId?: string;
  displayOrder?: number;
}

/** Update only the ordering (or other supported journey fields) from admin views. */
export async function updateCollectionJourney(
  journeyId: string,
  payload: { displayOrder: number },
  userId?: string,
): Promise<CollectionJourney> {
  const data = await apiFetch<CollectionJourney>(`/api/journeys/${journeyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    userId,
  });
  return data;
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
