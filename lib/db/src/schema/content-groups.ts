import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Content Groups ────────────────────────────────────────────────────────────
// A separate grouping layer that sits alongside (and never replaces) Journey
// Collections. A content group can hold journeys, daily-rhythms, and/or
// daily-devotional series in any mix.
//
// Supported targetType values:
//   'journey'           – a Journey with journey_type ≠ 'daily-rhythm'
//   'daily-rhythm'      – a Journey with journey_type = 'daily-rhythm'
//   'daily-devotional'  – a DevotionalSeries

export const contentGroupsTable = pgTable("content_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").default(""),
  coverImageUrl: text("cover_image_url"),
  status: text("status").notNull().default("Draft"), // Draft | Published | Archived
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertContentGroupSchema = createInsertSchema(contentGroupsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertContentGroup = z.infer<typeof insertContentGroupSchema>;
export type ContentGroup = typeof contentGroupsTable.$inferSelect;

// ─── Content Group Items ───────────────────────────────────────────────────────
// Many-to-many ordered membership table. A single content item can appear in
// multiple groups. displayOrder is scoped per-group.
//
// targetType  | targetId type
// ------------|---------------------
// journey     | journeys.id (text)
// daily-rhythm| journeys.id (text)
// daily-devotional | devotional_series.id (uuid as text)

export const contentGroupItemsTable = pgTable("content_group_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => contentGroupsTable.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),  // 'journey' | 'daily-rhythm' | 'daily-devotional'
  targetId: text("target_id").notNull(),       // PK of the referenced content
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("content_group_items_group_target_unique").on(table.groupId, table.targetType, table.targetId),
]);

export const insertContentGroupItemSchema = createInsertSchema(contentGroupItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertContentGroupItem = z.infer<typeof insertContentGroupItemSchema>;
export type ContentGroupItem = typeof contentGroupItemsTable.$inferSelect;
