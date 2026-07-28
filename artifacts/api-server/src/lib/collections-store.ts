/**
 * Collections Store — Postgres/Drizzle CRUD for Journey Collections.
 *
 * A collection groups related journeys (e.g. "Lent 2025", "Core Pathway").
 * Journeys carry a nullable collection_id; collections themselves are standalone.
 */

import { eq, asc, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { collectionsTable, journeysTable } from "@workspace/db/schema";
import type { Collection, InsertCollection } from "@workspace/db/schema";

export type { Collection };

export interface CollectionSummary {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSummary(
  row: Collection,
  journeyCount = 0,
  publishedJourneyCount = 0,
): CollectionSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    coverImageUrl: row.coverImageUrl ?? undefined,
    status: row.status,
    tags: (row.tags ?? []) as string[],
    displayOrder: row.displayOrder ?? 0,
    journeyCount,
    publishedJourneyCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listCollections(): Promise<CollectionSummary[]> {
  const rows = await db
    .select()
    .from(collectionsTable)
    .orderBy(asc(collectionsTable.displayOrder), desc(collectionsTable.createdAt));

  // Count journeys per collection (all statuses + published-only)
  const journeys = await db
    .select({ id: journeysTable.id, collectionId: journeysTable.collectionId, status: journeysTable.status })
    .from(journeysTable);

  const countMap: Record<string, number> = {};
  const publishedCountMap: Record<string, number> = {};
  for (const j of journeys) {
    if (j.collectionId) {
      countMap[j.collectionId] = (countMap[j.collectionId] ?? 0) + 1;
      if (j.status === 'Published') {
        publishedCountMap[j.collectionId] = (publishedCountMap[j.collectionId] ?? 0) + 1;
      }
    }
  }

  return rows.map(r => toSummary(r, countMap[r.id] ?? 0, publishedCountMap[r.id] ?? 0));
}

export async function getCollection(id: string): Promise<CollectionSummary | null> {
  const rows = await db
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.id, id));
  if (!rows[0]) return null;

  const journeys = await db
    .select({ id: journeysTable.id, status: journeysTable.status })
    .from(journeysTable)
    .where(eq(journeysTable.collectionId, id));

  const publishedCount = journeys.filter(j => j.status === 'Published').length;
  return toSummary(rows[0], journeys.length, publishedCount);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createCollection(
  data: Omit<InsertCollection, 'id'>,
  userId?: string
): Promise<CollectionSummary> {
  const rows = await db
    .insert(collectionsTable)
    .values({ ...data, createdBy: userId, updatedBy: userId })
    .returning();
  return toSummary(rows[0]);
}

export async function updateCollection(
  id: string,
  data: Partial<Omit<InsertCollection, 'id'>>,
  userId?: string
): Promise<CollectionSummary | null> {
  const rows = await db
    .update(collectionsTable)
    .set({ ...data, updatedAt: new Date(), updatedBy: userId })
    .where(eq(collectionsTable.id, id))
    .returning();
  if (!rows[0]) return null;

  const journeys = await db
    .select({ id: journeysTable.id })
    .from(journeysTable)
    .where(eq(journeysTable.collectionId, id));

  return toSummary(rows[0], journeys.length);
}

export async function deleteCollection(id: string): Promise<boolean> {
  // Unlink journeys first
  await db
    .update(journeysTable)
    .set({ collectionId: null })
    .where(eq(journeysTable.collectionId, id));

  const result = await db
    .delete(collectionsTable)
    .where(eq(collectionsTable.id, id))
    .returning();
  return result.length > 0;
}

export async function getJourneysInCollection(collectionId: string) {
  return db
    .select()
    .from(journeysTable)
    .where(eq(journeysTable.collectionId, collectionId))
    .orderBy(asc(journeysTable.createdAt));
}
