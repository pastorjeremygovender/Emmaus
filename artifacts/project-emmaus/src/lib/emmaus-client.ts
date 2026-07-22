/**
 * Emmaus API Client
 *
 * Typed fetch helpers for the Ask Emmaus conversation service.
 * Streaming uses the browser Fetch API and ReadableStream — never EventSource.
 *
 * Identity: passes X-User-Id header from the auth context (demo mode).
 * API base:  VITE_API_URL env var, defaulting to /api-server (Replit path routing).
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api-server') as string;

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface FlatContext {
  entryPoint?: 'bible' | 'walk' | 'journeys' | 'sermons' | 'personal' | 'standalone';
  conversationId?: string;
  userName?: string;
  // Bible
  bookId?: string;
  bookName?: string;
  chapter?: number;
  chapterHeading?: string;
  verseText?: string;
  // Journey
  journeyId?: string;
  journeyTitle?: string;
  currentDay?: number;
  // Sermon
  sermonId?: string;
  sermonTitle?: string;
  scriptureReference?: string;
}

export interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ScriptureRef {
  reference: string;
  book: string;
  chapter: number;
  displayText?: string;
}

export interface NextStep {
  action: string;
  primaryButtonText: string;
  path: string;
}

export interface Recommendation {
  type: 'journey' | 'sermon' | 'bible' | 'prayer' | 'room' | 'pastor';
  title: string;
  description?: string;
  path?: string;
  sermonId?: string;
  timestampSeconds?: number;
}

export interface EmmausMetadata {
  scripture: ScriptureRef | null;
  nextStep: NextStep | null;
  recommendations: Recommendation[];
  followUpPrompts: string[];
  handoffType: 'pastoral' | 'crisis' | null;
}

export interface ConversationStub {
  id: string;
  userId: string;
  title: string;
  entryPoint: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: EmmausMetadata;
  promptVersion: string;
  entryPoint: string;
  safetyChecked: boolean;
  createdAt: string;
}

// ─── SSE Event Types ──────────────────────────────────────────────────────────

export type SseTextEvent = { type: 'text'; content: string };
export type SseDoneEvent = {
  type: 'done';
  conversationId: string;
  messageId: string;
  metadata: EmmausMetadata;
  promptVersion: string;
};
export type SseErrorEvent = { type: 'error'; message: string };
export type SseEvent = SseTextEvent | SseDoneEvent | SseErrorEvent;

export type StreamCallbacks = {
  onText: (chunk: string) => void;
  onDone: (payload: SseDoneEvent) => void;
  onError: (message: string) => void;
};

// ─── Streaming Helper ─────────────────────────────────────────────────────────

/**
 * Parse and dispatch SSE events from a fetch response stream.
 * Handles line-buffered `data: {...}` format.
 */
async function consumeStream(
  response: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  if (!response.body) {
    callbacks.onError('Empty response from server.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const json = trimmed.slice('data: '.length);
        try {
          const event = JSON.parse(json) as SseEvent;
          if (event.type === 'text') {
            callbacks.onText(event.content);
          } else if (event.type === 'done') {
            callbacks.onDone(event as SseDoneEvent);
          } else if (event.type === 'error') {
            callbacks.onError((event as SseErrorEvent).message);
          }
        } catch {
          // Malformed line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── API Calls ────────────────────────────────────────────────────────────────

function headers(userId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };
}

/**
 * Start or continue an Ask Emmaus conversation.
 * Streams SSE events into the provided callbacks.
 * Returns an AbortController so callers can cancel.
 */
export function startConversation(opts: {
  userId: string;
  message: string;
  context?: FlatContext;
  history?: HistoryItem[];
  callbacks: StreamCallbacks;
  signal?: AbortSignal;
}): { abort: () => void } {
  const controller = new AbortController();
  // If a parent signal is provided, abort our controller when it fires
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/emmaus/conversation`, {
        method: 'POST',
        headers: headers(opts.userId),
        body: JSON.stringify({
          message: opts.message,
          context: opts.context,
          history: opts.history,
        }),
        signal,
      });

      if (!res.ok) {
        opts.callbacks.onError(`Server error: ${res.status}`);
        return;
      }

      await consumeStream(res, opts.callbacks);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      opts.callbacks.onError('Connection lost. Please try again.');
    }
  })();

  return { abort: () => controller.abort() };
}

/**
 * Append a message to an existing conversation (SSE stream).
 */
export function appendMessage(opts: {
  userId: string;
  conversationId: string;
  message: string;
  context?: FlatContext;
  history?: HistoryItem[];
  callbacks: StreamCallbacks;
  signal?: AbortSignal;
}): { abort: () => void } {
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;

  (async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/emmaus/conversation/${opts.conversationId}/message`,
        {
          method: 'POST',
          headers: headers(opts.userId),
          body: JSON.stringify({
            message: opts.message,
            context: opts.context,
            history: opts.history,
          }),
          signal,
        }
      );

      if (!res.ok) {
        opts.callbacks.onError(`Server error: ${res.status}`);
        return;
      }

      await consumeStream(res, opts.callbacks);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      opts.callbacks.onError('Connection lost. Please try again.');
    }
  })();

  return { abort: () => controller.abort() };
}

/**
 * List the user's past conversations.
 */
export async function listConversations(userId: string): Promise<ConversationStub[]> {
  try {
    const res = await fetch(`${API_BASE}/api/emmaus/conversations`, {
      headers: headers(userId),
    });
    if (!res.ok) return [];
    return (await res.json()) as ConversationStub[];
  } catch {
    return [];
  }
}

/**
 * Get all messages in a conversation.
 */
export async function getMessages(
  userId: string,
  conversationId: string
): Promise<StoredMessage[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/emmaus/conversation/${conversationId}/messages`,
      { headers: headers(userId) }
    );
    if (!res.ok) return [];
    return (await res.json()) as StoredMessage[];
  } catch {
    return [];
  }
}

/**
 * Save a user-approved memory note.
 */
export async function saveMemory(
  userId: string,
  content: string,
  source = 'manual'
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/emmaus/memory`, {
      method: 'POST',
      headers: headers(userId),
      body: JSON.stringify({ userId, content, source }),
    });
  } catch {
    // Silent failure — memory is non-critical
  }
}
