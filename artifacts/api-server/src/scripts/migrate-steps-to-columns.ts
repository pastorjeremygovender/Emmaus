/**
 * One-time migration: copy field values from the legacy `content` JSONB column
 * into the new explicit columns added in the schema expansion.
 *
 * Safe to run multiple times — only updates rows where the new columns are empty.
 *
 * Run from the api-server directory:
 *   node --experimental-strip-types src/scripts/migrate-steps-to-columns.ts
 */

import { db } from "@workspace/db";
import { journeyStepsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function migrate() {
  console.log("Migrating step data from content JSONB → explicit columns...");

  const rows = await db.select().from(journeyStepsTable);

  let updated = 0;
  for (const row of rows) {
    const content = (row.content ?? {}) as Record<string, unknown>;

    // Skip if new columns are already populated
    const alreadyMigrated =
      row.mentorIntro || row.teachingContent || row.prayer || row.todaysAction;
    if (alreadyMigrated) {
      console.log(`  Step ${row.journeyId} day ${row.day} — already migrated, skipping.`);
      continue;
    }

    // Map old content fields → new columns
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (content.mentorIntro)        updateFields.mentorIntro        = content.mentorIntro;
    if (content.scripture)          updateFields.scripture          = content.scripture;
    if (content.devotional)         updateFields.teachingContent    = content.devotional;
    if (content.reflectionQuestion) updateFields.reflectionQuestion = content.reflectionQuestion;
    if (content.prayerPrompt)       updateFields.prayer             = content.prayerPrompt;
    if (content.actionStep)         updateFields.todaysAction       = content.actionStep;

    // Migrate sermon fields → suggestedSermons[0]
    const hasSermon = content.sermonTimestampSeconds || content.sermonLink || content.sermonContextualSentence;
    if (hasSermon) {
      updateFields.suggestedSermons = [{
        timestamp: content.sermonTimestampSeconds,
        link: content.sermonLink,
        contextualSentence: content.sermonContextualSentence,
      }];
    }

    await db
      .update(journeyStepsTable)
      .set(updateFields)
      .where(eq(journeyStepsTable.id, row.id));

    console.log(`  Migrated: ${row.journeyId} day ${row.day} — "${row.title}"`);
    updated++;
  }

  console.log(`\nMigration complete. ${updated} rows updated, ${rows.length - updated} already migrated.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
