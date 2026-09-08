import { pool } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Small durable state bridge for the YouTube archive.
 *
 * The archive predates the database-backed content stores and still has large
 * JSON files on disk. Deployment filesystems are replaceable, so operational
 * state must be mirrored into PostgreSQL. JSON is intentional here: it lets us
 * migrate the existing archive without changing its public TypeScript shapes.
 */
export async function readArchiveState<T>(key: string): Promise<T | null> {
  try {
    const result = await pool.query(
      "SELECT payload FROM youtube_archive_state WHERE state_key = $1",
      [key],
    );
    return result.rows[0]?.payload ? (result.rows[0].payload as T) : null;
  } catch (err) {
    logger.warn({ err, key }, "Archive durable state read failed; using file fallback");
    return null;
  }
}

export async function writeArchiveState(key: string, payload: unknown): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO youtube_archive_state (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [key, JSON.stringify(payload)],
    );
  } catch (err) {
    // The file store remains a useful development fallback if the database is
    // temporarily unavailable. Log loudly so deployment diagnostics identify it.
    logger.error({ err, key }, "Archive durable state write failed");
  }
}