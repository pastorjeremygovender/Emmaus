import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  unique,
} from "drizzle-orm/pg-core";

// ─── Devotional Series ─────────────────────────────────────────────────────────
// A recurring devotional collection (e.g. "Psalms Daily Devotional").
// Not a Journey — no enrolment, no completion %, no certificates.

export const devotionalSeriesTable = pgTable("devotional_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").default(""),
  seriesType: text("series_type").notNull().default("general"),
  // series_type: psalms | proverbs | general | seasonal | church-specific
  status: text("status").notNull().default("Draft"),
  // status: Draft | Published | Archived
  publishedAt: timestamp("published_at"),
  // Smart content indicators — set when admin opts-in to notifying members on publish.
  notifyPublishedAt: timestamp("notify_published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

export type DevotionalSeries = typeof devotionalSeriesTable.$inferSelect;

// ─── Devotional Entries ────────────────────────────────────────────────────────
// Each entry is one day in a devotional series.
// Scripture reference is stored only — passage text is loaded dynamically from
// the member's chosen Bible translation at read time.

export const devotionalEntriesTable = pgTable("devotional_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => devotionalSeriesTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull().default(""),
  scriptureReference: text("scripture_reference").default(""),
  greeting: text("greeting").default(""),
  considerThis: text("consider_this").default(""),
  prayer: text("prayer").default(""),
  nextStep: text("next_step").default(""),
  closing: text("closing").default(""),
  // Optional per-entry display label (e.g. "1 January"). Overrides "Day N" when non-empty.
  displayLabel: text("display_label"),
  // Optional share image — stored as an object-storage path ("/objects/...").
  // When set, members see a "Take this with you" card with Save + Share actions.
  shareImageUrl: text("share_image_url"),
  status: text("status").notNull().default("Draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("devotional_entries_series_day_unique").on(table.seriesId, table.dayNumber),
]);

export type DevotionalEntry = typeof devotionalEntriesTable.$inferSelect;

// ─── Devotional Progress ───────────────────────────────────────────────────────
// Per-user progress within a devotional series.
// Completely separate from Journey progress — no shared data or logic.

export const devotionalProgressTable = pgTable("devotional_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => devotionalSeriesTable.id, { onDelete: "cascade" }),
  currentDay: integer("current_day").notNull().default(1),
  completedDays: jsonb("completed_days").$type<number[]>().notNull().default([]),
  // Engagement lifecycle status — active | paused
  // Added via startup migration; DEFAULT 'active' for existing rows.
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Set to NOW() when the member opens/views the content — used by badge computation.
  lastOpenedAt: timestamp("last_opened_at"),
}, (table) => [
  unique("devotional_progress_user_series_unique").on(table.userId, table.seriesId),
]);

export type DevotionalProgress = typeof devotionalProgressTable.$inferSelect;
