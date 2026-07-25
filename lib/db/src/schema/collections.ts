import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Collections ────────────────────────────────────────────────────────────────
// A collection groups related journeys (e.g. "Lent Series 2025", "Core Pathway").
// Journeys carry a nullable collection_id FK; collections themselves are standalone.

export const collectionsTable = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").default(""),
  coverImageUrl: text("cover_image_url"),
  status: text("status").notNull().default("Draft"), // Draft|Published|Archived
  tags: jsonb("tags").$type<string[]>().default([]),
  displayOrder: integer("display_order").default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertCollectionSchema = createInsertSchema(collectionsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Collection = typeof collectionsTable.$inferSelect;
