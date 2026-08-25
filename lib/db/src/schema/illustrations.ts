import { pgTable, text, timestamp, integer, jsonb, uuid, index } from "drizzle-orm/pg-core";

export const illustrationsTable = pgTable("illustrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentType: text("content_type").notNull(),
  contentId: text("content_id").notNull(),
  stepId: text("step_id"),
  illustrationType: text("illustration_type").notNull(),
  templateType: text("template_type"),
  sourceSvg: text("source_svg"),
  displayObjectPath: text("display_object_path"),
  thumbnailObjectPath: text("thumbnail_object_path"),
  generationInstruction: text("generation_instruction"),
  structuredData: jsonb("structured_data").$type<Record<string, unknown>>().default({}),
  caption: text("caption"),
  alternativeText: text("alternative_text").notNull().default(""),
  adminNote: text("admin_note"),
  placement: text("placement").notNull().default("after-reflection"),
  paragraphPosition: integer("paragraph_position"),
  status: text("status").notNull().default("Draft"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  contentIdx: index("illustrations_content_idx").on(table.contentType, table.contentId, table.stepId),
  statusIdx: index("illustrations_status_idx").on(table.status),
}));

export type Illustration = typeof illustrationsTable.$inferSelect;
export type InsertIllustration = typeof illustrationsTable.$inferInsert;