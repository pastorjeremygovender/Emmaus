import { pool } from "@workspace/db";
import type {
  ConversationStore,
  EmmausConversation,
  EmmausMemory,
  EmmausMessage,
  EmmausResponseMetadata,
  EmmausSafetyFlag,
  EntryPoint,
  HandoffType,
  MessageRole,
} from "./firestore-model.js";

type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  entry_point: EntryPoint;
  created_at: Date | string;
  updated_at: Date | string;
  message_count: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  metadata: EmmausResponseMetadata | null;
  prompt_version: string;
  entry_point: EntryPoint;
  safety_checked: boolean;
  resource_interactions: string[] | null;
  created_at: Date | string;
};

type MemoryRow = {
  id: string;
  user_id: string;
  content: string;
  source: string;
  created_at: Date | string;
  approved: boolean;
};

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const conversationFromRow = (row: ConversationRow): EmmausConversation => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  entryPoint: row.entry_point,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  messageCount: row.message_count,
});

const messageFromRow = (row: MessageRow): EmmausMessage => ({
  id: row.id,
  conversationId: row.conversation_id,
  userId: row.user_id,
  role: row.role,
  content: row.content,
  ...(row.metadata ? { metadata: row.metadata } : {}),
  promptVersion: row.prompt_version,
  entryPoint: row.entry_point,
  safetyChecked: row.safety_checked,
  resourceInteractions: Array.isArray(row.resource_interactions) ? row.resource_interactions : [],
  createdAt: iso(row.created_at),
});

/**
 * Durable Jarvis conversation storage in Emmaus's existing PostgreSQL database.
 * All owner checks remain in the service layer; write queries still include the
 * authenticated user where ownership is relevant.
 */
export class PostgresConversationStore implements ConversationStore {
  async createConversation(
    data: Omit<EmmausConversation, "id" | "createdAt" | "updatedAt" | "messageCount">,
  ): Promise<EmmausConversation> {
    const result = await pool.query<ConversationRow>(
      `INSERT INTO emmaus_conversations (user_id, title, entry_point)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.userId, data.title, data.entryPoint],
    );
    return conversationFromRow(result.rows[0]);
  }

  async getConversation(id: string): Promise<EmmausConversation | null> {
    const result = await pool.query<ConversationRow>(
      "SELECT * FROM emmaus_conversations WHERE id = $1 LIMIT 1",
      [id],
    );
    return result.rows[0] ? conversationFromRow(result.rows[0]) : null;
  }

  async listConversations(userId: string): Promise<EmmausConversation[]> {
    const result = await pool.query<ConversationRow>(
      `SELECT * FROM emmaus_conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );
    return result.rows.map(conversationFromRow);
  }

  async updateConversation(id: string, updates: Partial<EmmausConversation>): Promise<void> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (updates.title !== undefined) add("title", updates.title);
    if (updates.entryPoint !== undefined) add("entry_point", updates.entryPoint);
    if (updates.messageCount !== undefined) add("message_count", updates.messageCount);
    if (assignments.length === 0) return;
    values.push(id);
    await pool.query(
      `UPDATE emmaus_conversations
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length}`,
      values,
    );
  }

  async addMessage(data: Omit<EmmausMessage, "id" | "createdAt">): Promise<EmmausMessage> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<MessageRow>(
        `INSERT INTO emmaus_messages (
           conversation_id, user_id, role, content, metadata, prompt_version,
           entry_point, safety_checked, resource_interactions
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)
         RETURNING *`,
        [
          data.conversationId,
          data.userId,
          data.role,
          data.content,
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.promptVersion,
          data.entryPoint,
          data.safetyChecked,
          JSON.stringify(data.resourceInteractions),
        ],
      );
      await client.query(
        `UPDATE emmaus_conversations
         SET message_count = message_count + 1, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [data.conversationId, data.userId],
      );
      await client.query("COMMIT");
      return messageFromRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessages(conversationId: string): Promise<EmmausMessage[]> {
    const result = await pool.query<MessageRow>(
      `SELECT * FROM emmaus_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );
    return result.rows.map(messageFromRow);
  }

  async addMemory(data: Omit<EmmausMemory, "id" | "createdAt">): Promise<EmmausMemory> {
    const result = await pool.query<MemoryRow>(
      `INSERT INTO emmaus_memories (user_id, content, source, approved)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.userId, data.content, data.source, data.approved],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      source: row.source,
      createdAt: iso(row.created_at),
      approved: row.approved,
    };
  }

  async getMemories(userId: string): Promise<EmmausMemory[]> {
    const result = await pool.query<MemoryRow>(
      `SELECT * FROM emmaus_memories
       WHERE user_id = $1 AND approved = true
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      content: row.content,
      source: row.source,
      createdAt: iso(row.created_at),
      approved: row.approved,
    }));
  }

  async deleteMemory(id: string, userId: string): Promise<void> {
    await pool.query(
      "DELETE FROM emmaus_memories WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
  }

  async flagSafety(data: Omit<EmmausSafetyFlag, "id" | "createdAt">): Promise<void> {
    await pool.query(
      `INSERT INTO emmaus_safety_flags (
         user_id, conversation_id, message_content, trigger_keywords, response_type
       ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        data.userId,
        data.conversationId,
        data.messageContent,
        JSON.stringify(data.triggerKeywords),
        data.responseType satisfies Exclude<HandoffType, null>,
      ],
    );
  }
}
