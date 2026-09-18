/**
 * Idempotent schema required by Jarvis conversations.
 *
 * This module intentionally contains schema DDL only. It does not insert,
 * update, or delete user or authored-content records.
 */
import { pool } from "@workspace/db";

const JARVIS_CONVERSATION_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS emmaus_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      title text NOT NULL,
      entry_point text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      message_count integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS emmaus_conversations_user_updated_idx
      ON emmaus_conversations(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS emmaus_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES emmaus_conversations(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      metadata jsonb,
      prompt_version text NOT NULL,
      entry_point text NOT NULL,
      safety_checked boolean NOT NULL DEFAULT false,
      resource_interactions jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS emmaus_messages_conversation_created_idx
      ON emmaus_messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS emmaus_memories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      content text NOT NULL,
      source text NOT NULL,
      approved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS emmaus_memories_user_approved_idx
      ON emmaus_memories(user_id, approved, created_at DESC);
    CREATE TABLE IF NOT EXISTS emmaus_safety_flags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      conversation_id uuid NOT NULL REFERENCES emmaus_conversations(id) ON DELETE CASCADE,
      message_content text NOT NULL,
      trigger_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
      response_type text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS emmaus_safety_flags_user_created_idx
      ON emmaus_safety_flags(user_id, created_at DESC);`;

export async function ensureJarvisConversationSchema(): Promise<void> {
  await pool.query(JARVIS_CONVERSATION_SCHEMA_SQL);
}
