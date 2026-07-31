import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Journeys ─────────────────────────────────────────────────────────────────
// ID is a slug-based string (e.g. "walk-through-luke") for backward compat.
// "Day" is the user-facing term; "Step" is the internal entity name.

export const journeysTable = pgTable("journeys", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description").notNull().default(""),
  coverImageUrl: text("cover_image_url"),

  // Classification
  journeyType: text("journey_type").notNull().default("core"),
  category: text("category"),          // e.g. 'Devotional', 'Bible Study', 'Course', 'Training'
  difficulty: text("difficulty"),      // e.g. 'Beginner', 'Intermediate', 'Advanced'
  estimatedDuration: text("estimated_duration"),  // e.g. '5 min/day'
  tags: jsonb("tags").$type<string[]>().default([]),
  prerequisites: jsonb("prerequisites").$type<string[]>().default([]),  // journey IDs

  // Scheduling
  durationDays: integer("duration_days").notNull().default(0),  // auto-updated from step count
  startDate: text("start_date"),
  endDate: text("end_date"),
  churchWide: boolean("church_wide").default(false),

  // Gamification
  xpReward: integer("xp_reward").default(10),

  // Admin fields
  status: text("status").notNull().default("Draft"),  // Draft|Pastoral Review|Approved|Published|Archived
  linkedSermonId: text("linked_sermon_id"),
  overloadExempt: boolean("overload_exempt").default(false),
  pastorEdited: boolean("pastor_edited").default(false),
  publishedAt: timestamp("published_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Branding & versioning
  themeColor: text("theme_color"),   // hex colour, e.g. '#3B82F6' — nullable
  version: integer("version").notNull().default(1),  // incremented on each publish

  // Smart content indicators — set when admin opts-in to notifying members on publish.
  // null = never opted in; a timestamp value = "notify as of this date" (7-day NEW window).
  notifyPublishedAt: timestamp("notify_published_at"),

  // Content Studio grouping (nullable — uncollected journeys still work)
  collectionId: text("collection_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const insertJourneySchema = createInsertSchema(journeysTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertJourney = z.infer<typeof insertJourneySchema>;
export type Journey = typeof journeysTable.$inferSelect;

// ─── Journey Steps ─────────────────────────────────────────────────────────────
// Each step is stored as a separate DB record. The `day` column is the step number
// (1-based). "Day 1" in the UI maps to step with day=1 in the DB.
//
// Fields are explicit columns (not JSONB) to support SQL queries, CSV import,
// and AI retrieval. The `content` JSONB column is kept as a legacy fallback.
//
// Sermon references live in `suggestedSermons` JSONB array:
//   [{ sermonId?, timestamp?, topic?, link?, contextualSentence? }]

export const journeyStepsTable = pgTable("journey_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  journeyId: text("journey_id")
    .notNull()
    .references(() => journeysTable.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),  // step number; unique within journey

  // Core display
  title: text("title").notNull().default(""),

  // Canonical discipleship fields — these are queried by Ask Emmaus
  mentorIntro: text("mentor_intro").default(""),
  scripture: text("scripture").default(""),  // primary reference, e.g. "John 1:14"
  teachingContent: text("teaching_content").default(""),  // main devotional body
  reflectionQuestion: text("reflection_question").default(""),
  prayer: text("prayer").default(""),  // guided prayer in first person
  todaysAction: text("todays_action").default(""),  // concrete action step
  memoryVerse: text("memory_verse"),  // optional

  // Extended fields
  preferredTranslation: text("preferred_translation"),  // e.g. 'NIV', 'ESV'
  estimatedReadingTime: integer("estimated_reading_time"),  // minutes
  xpReward: integer("xp_reward").default(5),

  // JSONB arrays
  scriptureReferences: jsonb("scripture_references")
    .$type<Array<{ reference: string; translation?: string; verseText?: string }>>()
    .default([]),
  suggestedSermons: jsonb("suggested_sermons")
    .$type<Array<{ sermonId?: string; timestamp?: number; topic?: string; link?: string; contextualSentence?: string }>>()
    .default([]),
  suggestedFollowUpQuestions: jsonb("suggested_follow_up_questions")
    .$type<string[]>()
    .default([]),
  unlockConditions: jsonb("unlock_conditions")
    .$type<Record<string, unknown> | null>()
    .default(null),

  // Import provenance — populated when step was created via CSV import
  importBatchId: text("import_batch_id"),
  importSource: text("import_source"),

  // Legacy JSONB fallback — read by toFrontendStep() when new columns are empty
  content: jsonb("content").$type<Record<string, unknown>>().default({}),

  status: text("status").notNull().default("draft"),

  // Marks this step as the Walk Completion entry — not a numbered lesson.
  // Completion steps are excluded from lesson lists, progress counts, and durationDays.
  // They are displayed only via the dedicated /journey/:id/complete page.
  isCompletionStep: boolean("is_completion_step").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Enforce step uniqueness within a journey so (journeyId, day) is a reliable key
  unique("journey_steps_journey_id_day_unique").on(table.journeyId, table.day),
]);

export const insertJourneyStepSchema = createInsertSchema(journeyStepsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJourneyStep = z.infer<typeof insertJourneyStepSchema>;
export type JourneyStep = typeof journeyStepsTable.$inferSelect;

// ─── User Journey Progress ──────────────────────────────────────────────────────

export const userJourneyProgressTable = pgTable("user_journey_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  journeyId: text("journey_id")
    .notNull()
    .references(() => journeysTable.id, { onDelete: "cascade" }),
  currentDay: integer("current_day").notNull().default(1),
  completedDays: jsonb("completed_days").$type<number[]>().notNull().default([]),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastCompletedAt: timestamp("last_completed_at"),
  status: text("status").notNull().default("active"),  // active|completed|paused|dropped
  // Set to NOW() when the member opens/views the content — used by badge computation.
  lastOpenedAt: timestamp("last_opened_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserJourneyProgressSchema = createInsertSchema(
  userJourneyProgressTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserJourneyProgress = z.infer<typeof insertUserJourneyProgressSchema>;
export type UserJourneyProgress = typeof userJourneyProgressTable.$inferSelect;

// ─── Step Reflections ──────────────────────────────────────────────────────────

export const stepReflectionsTable = pgTable("step_reflections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  journeyId: text("journey_id").notNull(),
  day: integer("day").notNull(),
  reflection: text("reflection").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Bible Annotations ─────────────────────────────────────────────────────────
// Schema-only for now — not displayed in UI. Prepared for future Bible study
// overlays, AI retrieval, and journey-to-scripture linking.

export const bibleAnnotationsTable = pgTable("bible_annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  book: text("book").notNull(),          // e.g. 'John'
  chapter: integer("chapter").notNull(),
  verseStart: integer("verse_start").notNull(),
  verseEnd: integer("verse_end"),        // optional range end
  title: text("title").notNull().default(""),
  teaching: text("teaching").default(""),
  application: text("application").default(""),
  // Cross-references
  relatedJourneySteps: jsonb("related_journey_steps")
    .$type<Array<{ journeyId: string; stepDay: number }>>()
    .default([]),
  relatedSermons: jsonb("related_sermons").$type<string[]>().default([]),
  relatedTopics: jsonb("related_topics").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

export type BibleAnnotation = typeof bibleAnnotationsTable.$inferSelect;

// ─── Journey Imports ────────────────────────────────────────────────────────────
// Tracks CSV import batches. Steps created from imports carry the batch's ID in
// `journey_steps.import_batch_id`. The importer is not yet built — this table
// is the architectural anchor.

export const journeyImportsTable = pgTable("journey_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  journeyId: text("journey_id")
    .notNull()
    .references(() => journeysTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),       // original CSV filename
  status: text("status").notNull().default("pending"),  // pending|processing|complete|failed
  rowCount: integer("row_count").default(0),
  processedCount: integer("processed_count").default(0),
  errorLog: jsonb("error_log").$type<Array<{ row: number; error: string }>>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

export type JourneyImport = typeof journeyImportsTable.$inferSelect;

// ─── Journey Audit Log ─────────────────────────────────────────────────────────
// Immutable record written on every permanent deletion.
// Never deleted — these records survive even when the journey is gone.

export const journeyAuditLogTable = pgTable("journey_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),           // 'permanent_delete'
  adminId: text("admin_id").notNull(),
  adminEmail: text("admin_email").notNull().default(""),
  journeyId: text("journey_id").notNull(),    // the former journey slug
  journeyTitle: text("journey_title").notNull(),
  stepCount: integer("step_count").notNull().default(0),
  blockCount: integer("block_count").notNull().default(0),
  progressCount: integer("progress_count").notNull().default(0),
  reflectionCount: integer("reflection_count").notNull().default(0),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

export type JourneyAuditLog = typeof journeyAuditLogTable.$inferSelect;
