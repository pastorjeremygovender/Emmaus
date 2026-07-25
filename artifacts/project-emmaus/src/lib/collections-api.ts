/**
 * Collections API client
 * Wrappers around the /api/collections routes.
 */

import { getApiUrl } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Collection = {
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
};

export type CollectionInput = {
  title: string;
  description?: string;
  coverImageUrl?: string;
  status?: string;
  tags?: string[];
  displayOrder?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts: RequestInit & { userId?: string } = {}): Promise<T> {
  const { userId, ...rest } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };
  if (userId) headers['X-User-Id'] = userId;
  const res = await fetch(getApiUrl(path), { ...rest, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listCollections(): Promise<Collection[]> {
  const data = await apiFetch<{ collections: Collection[] }>('/api/collections');
  return data.collections;
}

export async function getCollection(id: string): Promise<Collection> {
  const data = await apiFetch<{ collection: Collection }>(`/api/collections/${encodeURIComponent(id)}`);
  return data.collection;
}

export async function createCollection(input: CollectionInput, userId?: string): Promise<Collection> {
  const data = await apiFetch<{ collection: Collection }>('/api/collections', {
    method: 'POST',
    body: JSON.stringify(input),
    userId,
  });
  return data.collection;
}

export async function updateCollection(id: string, input: Partial<CollectionInput>, userId?: string): Promise<Collection> {
  const data = await apiFetch<{ collection: Collection }>(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    userId,
  });
  return data.collection;
}

export async function deleteCollection(id: string, userId?: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    userId,
  });
}
