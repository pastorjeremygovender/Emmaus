/**
 * Emmaus API Client
 *
 * Typed fetch helpers for the Ask Emmaus conversation service.
 * Streaming uses the browser Fetch API and ReadableStream — never EventSource.
 *
 * Identity: derived server-side from the secure session cookie.
 * API base:  VITE_API_URL env var, defaulting to '' (empty string).
 *            Empty string means requests go to /api/emmaus/… — the shared
 *            Replit reverse proxy routes /api → API server on port 8080.
 *            Never use '/api-server' as a prefix; that path is not registered.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '') as string;

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
  journeyType?: string;
  currentDay?: number;
  // Sermon
  sermonId?: string;
  sermonTitle?: string;
  scriptureReference?: string;
  /**
   * Phase 3: Voice Mode injects a plain-text summary of the user's current
   * app state (active content, reading context) so Emmaus can answer voice
   * questions such as "what's in My Emmaus?" or "explain that scripture"
   * without the user needing to navigate to the relevant page first.
   */
  voiceAppContext?: string;
}

export interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ScriptureRef {
  reference: string;
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  displayText?: string;
}

export interface NextStep {
  action: string;
  primaryButtonText: string;
  path: string;
}

/** One item in the practical next-steps footer (📖 🙏 🎧 🚶).
 *  "listen" steps are always injected from verified server-side data. */
export interface NextStepItem {
  type: 'read' | 'pray' | 'listen' | 'continue';
  text: string;
  path?: string;                    // for listen: YouTube timestamped URL (Watch)
  timestampSeconds?: number;        // absolute YouTube timestamp (for Watch)
  speakerName?: string;
  // Audio player fields (populated when a trimmed audio asset is ready)
  audioUrl?: string;                // local audio file URL for in-app player
  relativeStartSeconds?: number;    // position within the trimmed audio (Listen)
  absoluteStartSeconds?: number;    // same as timestampSeconds (YouTube anchor)
  watchUrl?: string;                // explicit Watch URL (YouTube at absolute time)
  /** Trusted canonical sermon identity, when this is a sermon listen step. */
  sermonId?: string;
  /** Trusted resource identity for non-canonical sermon resource shapes. */
  resourceId?: string;
}

/**
 * Remove only verified listen steps already represented by a trusted sermon
 * card. Display titles are deliberately not considered identity.
 */
export function filterDuplicateSermonNextSteps(
  steps: NextStepItem[],
  trustedSermons: Array<{ sermonId?: string; resourceId?: string }>,
): NextStepItem[] {
  const identities = new Set(
    trustedSermons.flatMap((sermon) => [sermon.sermonId, sermon.resourceId].filter(
      (id): id is string => Boolean(id),
    )),
  );
  return steps.filter((step) =>
    step.type !== 'listen' ||
    ![step.sermonId, step.resourceId].some((id) => id && identities.has(id)),
  );
}

export interface Recommendation {
  type: 'journey' | 'walk' | 'sermon' | 'bible' | 'prayer' | 'room' | 'pastor' | 'daily-rhythm' | 'devotional' | 'bible-study' | 'sermon-companion';
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

export interface SermonRecommendation {
  sermonId: string;
  segmentId?: string;
  source: 'canonical' | 'archive';
  title: string;
  speaker: string;
  sermonDate: string;
  excerpt: string;
  reason: string;
  /** Present only when the result maps to a published canonical sermon. */
  openPath?: string;
  /** Present only when a verified YouTube URL exists. */
  watchUrl?: string;
  watchTimestampSeconds?: number;
  listenAvailable: boolean;
  listenPath?: string;
  /** Relative API audio path used by the in-app player. */
  audioUrl?: string;
  relativeStartSeconds?: number;
}

export interface EmmausMetadata {
  answer?: string;
  displayAnswer?: string;
  speakableAnswer?: string;
  scripture: ScriptureRef | null;
  nextStep: NextStep | null;
  /** Practical next-steps footer (📖 🙏 🎧 🚶). */
  nextSteps: NextStepItem[];
  recommendations: Recommendation[];
  sermonRecommendations?: SermonRecommendation[];
  followUpPrompts: string[];
  handoffType: 'pastoral' | 'crisis' | null;
  scriptureReferences?: ScriptureRef[];
  resourceRecommendations?: Array<{
    resourceType: string;
    resourceId: string;
    parentId?: string;
    reason: string;
    relevanceReasons?: string[];
  }>;
  prayer?: string | null;
  requestedIntent?: 'ASK' | 'READ' | 'OPEN' | 'CONTINUE' | 'FIND';
  retrievalFailures?: string[];
  resourceActions?: Array<{
    kind: 'OPEN' | 'READ' | 'CONTINUE';
    resourceType: string;
    resourceId: string;
    parentId?: string;
    route: string;
  }>;
  capabilityActions?: Array<{
    kind: 'OPEN' | 'READ' | 'CONTINUE';
    capabilityId: string;
    label: string;
    route: string;
  }>;
  conversationFocus?: {
    version: 1;
    resourceType: string;
    candidates: Array<{
      resourceType: string;
      resourceId: string;
      title: string;
      route: string;
      parentId?: string;
    }>;
    pendingSelection?: boolean;
  };
  jarvis?: JarvisResponseContract;
  jarvisIntent?: JarvisIntent;
  pipelineTimings?: {
    authMs: number | null;
    contextMs: number;
    routingMs: number;
    retrievalScriptureMs: number;
    retrievalSermonsMs: number;
    retrievalResourcesMs: number;
    retrievalMemoriesMs: number;
    retrievalRoomsMs: number;
    modelTtftMs: number | null;
    firstValidatedVisibleMs: number | null;
    modelGenerationMs: number;
    validationMs: number;
    totalMs: number;
  };
}

export type JarvisIntent =
  | 'TODAY'
  | 'CONTINUE'
  | 'DAILY_RHYTHM'
  | 'DAILY_DEVOTIONAL'
  | 'BIBLE_READ'
  | 'SERMON_SEARCH'
  | 'APP_HELP'
  | 'ASK';

export interface JarvisAction {
  kind: 'OPEN' | 'READ' | 'CONTINUE';
  targetType: 'capability' | 'resource' | 'scripture';
  targetId: string;
  label: string;
  route: string;
  resourceType?: string;
  parentId?: string;
}

export interface JarvisResponseContract {
  contractVersion: 'jarvis.v1';
  intent: JarvisIntent;
  pastoralText: string;
  scriptureReferences: ScriptureRef[];
  contentReferences: Array<{
    resourceType: string;
    resourceId: string;
    parentId?: string;
    title: string;
    reason: string;
  }>;
  suggestedNextAction: JarvisAction | null;
  actions: JarvisAction[];
  handoffType: 'pastoral' | 'crisis' | null;
  retrievalFailures: string[];
}

/** Pick only the server-returned action that may execute an imperative request. */
export function getImmediateEmmausAction(
  metadata: Pick<
    EmmausMetadata,
    'requestedIntent' | 'jarvis' | 'resourceActions' | 'capabilityActions' | 'nextStep'
  > | null | undefined,
): { route?: string } | null {
  if (
    metadata?.requestedIntent !== 'OPEN'
    && metadata?.requestedIntent !== 'READ'
    && metadata?.requestedIntent !== 'CONTINUE'
  ) {
    return null;
  }
  const nextStepAction = metadata.nextStep?.path
    ? { route: metadata.nextStep.path }
    : null;
  return metadata.jarvis?.suggestedNextAction
    ?? metadata.resourceActions?.[0]
    ?? metadata.capabilityActions?.[0]
    ?? nextStepAction
    ?? null;
}

/** Execute only routes that were validated and returned by the Emmaus server. */
export function executeValidatedEmmausAction(
  action: { route?: string } | null | undefined,
  navigate: (route: string) => void,
): boolean {
  const route = action?.route;
  if (!route || !route.startsWith('/') || route.startsWith('//') || /[\r\n]/u.test(route)) {
    return false;
  }
  navigate(route);
  return true;
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
  /** Present when the backend detected a "call me [name]" request in the
   *  user's message. The client should persist this via updateName(). */
  detectedNameUpdate?: string;
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
 *
 * Guarantees: exactly one of `onDone` or `onError` is called before returning,
 * even if the stream closes without a proper `done` event (proxy timeout, etc.).
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
  // Track whether a terminal callback was already dispatched so we never
  // call onDone/onError twice.
  let terminated = false;

  const terminate = (fn: () => void) => {
    if (terminated) return;
    terminated = true;
    fn();
  };

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
            terminate(() => callbacks.onDone(event as SseDoneEvent));
          } else if (event.type === 'error') {
            terminate(() => callbacks.onError((event as SseErrorEvent).message));
          }
        } catch {
          // Malformed line — skip
        }
      }
    }

    // Stream closed without a done/error event (proxy timeout, server crash, etc.)
    // Always surface an error so the component can reset isStreaming.
    terminate(() =>
      callbacks.onError('Emmaus didn\'t complete a response. Please try again.')
    );
  } finally {
    reader.releaseLock();
  }
}

// ─── API Calls ────────────────────────────────────────────────────────────────

function headers(_userId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

// How long to wait for a complete SSE response before timing out.
// Long enough for a full gpt-5 pastoral response; short enough that a frozen
// connection surfaces a visible error rather than an infinite spinner.
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Wire an optional parent AbortSignal into our controller and return a cleanup
 * function that removes the listener. Always use `controller.signal` for the
 * fetch — the returned { abort } function reliably aborts the correct signal.
 */
function chainSignal(controller: AbortController, parentSignal?: AbortSignal) {
  if (!parentSignal) return () => undefined;
  const handler = () => controller.abort();
  parentSignal.addEventListener('abort', handler, { once: true });
  return () => parentSignal.removeEventListener('abort', handler);
}

/**
 * Start a new Ask Emmaus conversation.
 * Streams SSE events into the provided callbacks.
 * Returns an { abort } handle so callers can cancel early.
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
  const unlinkParent = chainSignal(controller, opts.signal);

  (async () => {
    // Per-request timeout: abort after 90 s so isStreaming always resets.
    const timeoutId = setTimeout(() => {
      controller.abort();
      opts.callbacks.onError('Emmaus took too long to respond. Please try again.');
    }, REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/api/emmaus/conversation`, {
        method: 'POST',
        headers: headers(opts.userId),
        body: JSON.stringify({
          message: opts.message,
          context: opts.context,
          history: opts.history,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // A workflow restart can clear the development in-memory conversation
        // store while the browser still holds the old conversation ID. Start
        // a fresh thread for that one recoverable case; do not retry auth or
        // ownership failures.
        if (res.status === 404) {
          const freshContext = opts.context
            ? { ...opts.context, conversationId: undefined }
            : undefined;
          startConversation({
            userId: opts.userId,
            message: opts.message,
            context: freshContext,
            history: opts.history,
            callbacks: opts.callbacks,
            signal: opts.signal,
          });
          return;
        }
        opts.callbacks.onError(`Server error: ${res.status}`);
        return;
      }

      await consumeStream(res, opts.callbacks);
    } catch (err: unknown) {
      // AbortError: either user navigated away (no callback needed — onError was
      // already called by the timeout handler) or cancelled intentionally.
      if (err instanceof Error && err.name === 'AbortError') return;
      opts.callbacks.onError('Connection lost. Please try again.');
    } finally {
      clearTimeout(timeoutId);
      unlinkParent();
    }
  })();

  return { abort: () => controller.abort() };
}

/**
 * Append a follow-up message to an existing conversation (SSE stream).
 * Signal wiring: always uses controller.signal for fetch; chains an optional
 * parent signal so both abort paths reliably cancel the same request.
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
  // Always use controller.signal — not opts.signal directly — so that
  // { abort: () => controller.abort() } reliably cancels the fetch.
  const unlinkParent = chainSignal(controller, opts.signal);

  (async () => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      opts.callbacks.onError('Emmaus took too long to respond. Please try again.');
    }, REQUEST_TIMEOUT_MS);

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
          signal: controller.signal,
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
    } finally {
      clearTimeout(timeoutId);
      unlinkParent();
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
