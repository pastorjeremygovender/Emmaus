import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  unique,
} from "drizzle-orm/pg-core";

// Note: sermon_companion also has the following runtime columns added via startup migration
// (not yet in this schema file but present in the DB):
//   published_at timestamptz
//   is_current_week boolean
//   sermon_link text (on sermon_companion_entry)
// Those are maintained by startup-migrations.ts until a full Drizzle migration is run.

// ─── Sermon Companion ─────────────────────────────────────────────────────────
// A 5-day devotional companion generated from a single sermon.
// sermon_id is a text reference to the sermon record (JSON-file-backed store).

export const sermonCompanionTable = pgTable("sermon_companion", {
  id: uuid("id").primaryKey().defaultRandom(),
  sermonId: text("sermon_id").notNull(),
  title: text("title").notNull().default(""),
  numberOfDays: integer("number_of_days").notNull().default(5),
  status: text("status").notNull().default("Draft"),
  /** Set when admin publishes with "Notify members" checked — drives NEW/UPDATED badges. */
  notifyPublishedAt: timestamp("notify_published_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SermonCompanion = typeof sermonCompanionTable.$inferSelect;

// ─── Sermon Companion Entry ────────────────────────────────────────────────────
// One day within a sermon companion.

export const sermonCompanionEntryTable = pgTable("sermon_companion_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  companionId: uuid("companion_id").notNull(),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull().default(""),
  scriptureReference: text("scripture_reference").default(""),
  greeting: text("greeting").default(""),
  reflection: text("reflection").default(""),
  prayer: text("prayer").default(""),
  nextStep: text("next_step").default(""),
  closing: text("closing").default(""),
  status: text("status").notNull().default("Draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("sermon_companion_entry_companion_day_unique").on(table.companionId, table.dayNumber),
]);

export type SermonCompanionEntry = typeof sermonCompanionEntryTable.$inferSelect;

// ─── Sermon Companion Progress ────────────────────────────────────────────────
// Per-user progress through a sermon companion.

export const sermonCompanionProgressTable = pgTable("sermon_companion_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  companionId: uuid("companion_id").notNull(),
  currentDay: integer("current_day").notNull().default(1),
  completedDays: jsonb("completed_days").$type<number[]>().notNull().default([]),
  // Engagement lifecycle status — active | paused
  // Added via startup migration; DEFAULT 'active' for existing rows.
  status: text("status").notNull().default("active"),
  /** Set when member opens a companion entry — drives UPDATED badge dismissal. */
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("sermon_companion_progress_user_companion_unique").on(table.userId, table.companionId),
]);

export type SermonCompanionProgress = typeof sermonCompanionProgressTable.$inferSelect;
