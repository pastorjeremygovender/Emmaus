/**
 * Emmaus Firestore Data Model
 *
 * Defines TypeScript interfaces for all Emmaus conversation data and provides
 * a ConversationStore interface with two implementations:
 *   - InMemoryConversationStore  → always available; used in dev/mock mode
 *   - FirestoreConversationStore → used when FIREBASE_PROJECT_ID env var is set
 *
 * Required env vars for Firestore mode:
 *   FIREBASE_PROJECT_ID
 *   GOOGLE_APPLICATION_CREDENTIALS (service account JSON path)
 *   OR FIREBASE_SERVICE_ACCOUNT_KEY (inline JSON string)
 *
 * When these are absent, the service silently falls back to in-memory storage.
 * No startup errors are thrown.
 */

// ─── Firestore Collection Paths ───────────────────────────────────────────────

export const COLLECTIONS = {
  conversations:   "emmaus_conversations",
  messages:        "emmaus_messages",
  memories:        "emmaus_memories",
  safetyFlags:     "emmaus_safety_flags",
} as const;

// ─── Core Types ───────────────────────────────────────────────────────────────

export type EntryPoint =
  | "bible"
  | "walk"
  | "journeys"
  | "sermons"
  | "personal"
  | "standalone";

export type MessageRole = "user" | "assistant";

export type RecommendationType =
  | "journey"
  | "sermon"
  | "bible"
  | "prayer"
  | "room"
  | "pastor";

export type HandoffType = "pastoral" | "crisis" | null;

export interface ScriptureRef {
  reference: string;   // e.g. "John 3:16"
  book: string;        // e.g. "john"
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  displayText?: string;
}

export interface NextStep {
  action: string;              // e.g. "Read Psalm 42 slowly today."
  primaryButtonText: string;   // e.g. "Open Psalm 42"
  path: string;                // e.g. "/bible/read/psalms/42"
}

/** One item in the practical next-steps footer (📖 🙏 🎧 🚶) */
export interface NextStepItem {
  /** "read" | "pray" | "listen" | "continue"
   *  "listen" is ALWAYS injected by the service from verified sermon data.
   *  The LLM must never generate a "listen" item. */
  type: "read" | "pray" | "listen" | "continue";
  /** Human-readable label — e.g. "Romans 8" / "Father, help me trust you…" */
  text: string;
  /** Optional navigation target — for listen: YouTube timestamped URL (Watch) */
  path?: string;
  /** For "listen" items: absolute YouTube timestamp seconds */
  timestampSeconds?: number;
  /** For "listen" items: verified speaker name */
  speakerName?: string;
  // Audio player fields (populated when a trimmed audio asset is ready)
  audioUrl?: string;                // in-app audio URL
  relativeStartSeconds?: number;    // position within trimmed audio
  absoluteStartSeconds?: number;    // same as timestampSeconds (YouTube anchor)
  watchUrl?: string;                // explicit Watch URL (YouTube at absolute time)
}

export interface Recommendation {
  type: RecommendationType | EmmausResourceType;
  title: string;
  description?: string;
  path?: string;
  resourceId?: string;
  parentId?: string;
  sermonId?: string;
  timestampSeconds?: number;
  /** Custom badge label shown on the card (e.g. "Preached Here"). */
  label?: string;
  /** Verified speaker name — used on Preached Here sermon cards. */
  speakerName?: string;
}

/** Verified sermon search result shown directly in Ask Emmaus and Voice. */
export interface SermonRecommendation {
  sermonId: string;
  title: string;
  speaker: string;
  sermonDate: string;
  excerpt: string;
  reason: string;
  openPath: string;
  watchUrl: string;
  watchTimestampSeconds?: number;
  listenAvailable: boolean;
  listenPath?: string;
}

/** Resource types accepted by the validated Ask Emmaus contract. */
export type EmmausResourceType =
  | "sermon"
  | "sermon_companion"
  | "devotional"
  | "walk"
  | "walk_step"
  | "journey"
  | "bible_study"
  | "daily_rhythm";

export interface EmmausResponseMetadata {
  answer?: string;
  scripture: ScriptureRef | null;
  nextStep: NextStep | null;
  /** Practical next-steps footer rendered with emoji icons (📖 🙏 🎧 🚶).
   *  The LLM generates "read", "pray", and "continue" items.
   *  The conversation service appends the "listen" item from verified sermon data. */
  nextSteps: NextStepItem[];
  recommendations: Recommendation[];
  sermonRecommendations?: SermonRecommendation[];
  followUpPrompts: string[];
  handoffType: HandoffType;
  /** Canonical contract fields. Kept optional for persisted pre-contract messages. */
  scriptureReferences?: ScriptureRef[];
  resourceRecommendations?: Array<{
    resourceType: EmmausResourceType;
    resourceId: string;
    parentId?: string;
    reason: string;
  }>;
  prayer?: string | null;
}

// ─── Firestore Document Interfaces ───────────────────────────────────────────

export interface EmmausConversation {
  id: string;
  userId: string;
  title: string;          // auto-generated from first message
  entryPoint: EntryPoint;
  createdAt: string;      // ISO 8601
  updatedAt: string;
  messageCount: number;
}

export interface EmmausMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;        // pastoral text (metadata block stripped)
  metadata?: EmmausResponseMetadata;
  promptVersion: string;
  entryPoint: EntryPoint;
  safetyChecked: boolean;
  resourceInteractions: string[];  // IDs of resources the user opened from this response
  createdAt: string;
}

export interface EmmausMemory {
  id: string;
  userId: string;
  content: string;        // user-approved short note
  source: string;         // e.g. "conversation:abc123"
  createdAt: string;
  approved: boolean;
}

export interface EmmausSafetyFlag {
  id: string;
  userId: string;
  conversationId: string;
  messageContent: string;
  triggerKeywords: string[];
  responseType: "crisis" | "pastoral";
  createdAt: string;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

export interface ConversationStore {
  createConversation(data: Omit<EmmausConversation, "id" | "createdAt" | "updatedAt" | "messageCount">): Promise<EmmausConversation>;
  getConversation(id: string): Promise<EmmausConversation | null>;
  listConversations(userId: string): Promise<EmmausConversation[]>;
  updateConversation(id: string, updates: Partial<EmmausConversation>): Promise<void>;

  addMessage(data: Omit<EmmausMessage, "id" | "createdAt">): Promise<EmmausMessage>;
  getMessages(conversationId: string): Promise<EmmausMessage[]>;

  addMemory(data: Omit<EmmausMemory, "id" | "createdAt">): Promise<EmmausMemory>;
  getMemories(userId: string): Promise<EmmausMemory[]>;
  deleteMemory(id: string, userId: string): Promise<void>;

  flagSafety(data: Omit<EmmausSafetyFlag, "id" | "createdAt">): Promise<void>;
}

// ─── In-Memory Implementation ─────────────────────────────────────────────────

export class InMemoryConversationStore implements ConversationStore {
  private conversations = new Map<string, EmmausConversation>();
  private messages = new Map<string, EmmausMessage[]>();
  private memories = new Map<string, EmmausMemory>();
  private safetyFlags: EmmausSafetyFlag[] = [];

  async createConversation(data: Omit<EmmausConversation, "id" | "createdAt" | "updatedAt" | "messageCount">): Promise<EmmausConversation> {
    const conv: EmmausConversation = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    this.conversations.set(conv.id, conv);
    this.messages.set(conv.id, []);
    return conv;
  }

  async getConversation(id: string): Promise<EmmausConversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async listConversations(userId: string): Promise<EmmausConversation[]> {
    return Array.from(this.conversations.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateConversation(id: string, updates: Partial<EmmausConversation>): Promise<void> {
    const existing = this.conversations.get(id);
    if (existing) {
      this.conversations.set(id, { ...existing, ...updates, updatedAt: new Date().toISOString() });
    }
  }

  async addMessage(data: Omit<EmmausMessage, "id" | "createdAt">): Promise<EmmausMessage> {
    const msg: EmmausMessage = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const list = this.messages.get(data.conversationId) ?? [];
    list.push(msg);
    this.messages.set(data.conversationId, list);

    const conv = this.conversations.get(data.conversationId);
    if (conv) {
      this.conversations.set(data.conversationId, {
        ...conv,
        messageCount: list.length,
        updatedAt: new Date().toISOString(),
      });
    }
    return msg;
  }

  async getMessages(conversationId: string): Promise<EmmausMessage[]> {
    return this.messages.get(conversationId) ?? [];
  }

  async addMemory(data: Omit<EmmausMemory, "id" | "createdAt">): Promise<EmmausMemory> {
    const mem: EmmausMemory = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.memories.set(mem.id, mem);
    return mem;
  }

  async getMemories(userId: string): Promise<EmmausMemory[]> {
    return Array.from(this.memories.values()).filter(m => m.userId === userId && m.approved);
  }

  async deleteMemory(id: string, userId: string): Promise<void> {
    const mem = this.memories.get(id);
    if (mem && mem.userId === userId) this.memories.delete(id);
  }

  async flagSafety(data: Omit<EmmausSafetyFlag, "id" | "createdAt">): Promise<void> {
    this.safetyFlags.push({
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }
}

// ─── Store Factory ────────────────────────────────────────────────────────────

let _store: ConversationStore | null = null;

export function getConversationStore(): ConversationStore {
  if (!_store) {
    // Future: initialise FirestoreConversationStore when FIREBASE_PROJECT_ID is set
    // For now, always use in-memory store.
    _store = new InMemoryConversationStore();
  }
  return _store;
}
