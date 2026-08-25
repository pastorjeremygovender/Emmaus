/**
 * voice-conversation-client.ts — Client helper for the voice-specific LLM
 * conversation endpoint (POST /api/voice/conversation).
 *
 * This endpoint uses OpenAI tool/function calling so the LLM can dispatch
 * Emmaus actions (read_content, navigate) in natural language rather than
 * requiring the user to speak specific command phrases.
 *
 * Sprint 2: replaces the client-side regex intent classifier for all
 * non-deterministic intents (everything except reading-command, navigate,
 * and continue-reading which stay as fast-path regex shortcuts).
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '') as string;

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceToolName = 'read_content' | 'navigate' | 'continue_walk' | 'search_sermons';

export interface VoiceReadContentArgs {
  type: 'daily-rhythm' | 'devotional' | 'sermon-companion' | 'bible';
  bibleBook?: string;
  bibleChapter?: number;
  titleHint?: string;
}

export interface VoiceNavigateArgs {
  destination: 'walk' | 'bible' | 'discover' | 'journeys' | 'back';
}

/** Args emitted by the server after resolving the user's active walk. */
export interface VoiceContinueWalkArgs {
  /** Direct route to navigate to, e.g. '/journey/{id}/day/{day}'. Present when exactly one active walk found. */
  route?: string;
  /** TTS prompt to speak when zero or multiple walks require clarification. */
  prompt?: string;
  /** Human-readable journey title included when a single walk was resolved (for TTS announcements). */
  journeyTitle?: string;
  /** Current day number included when a single walk was resolved. */
  currentDay?: number;
}
export interface VoiceToolCall {
  tool: 'read_content';
  args: VoiceReadContentArgs;
}
export interface VoiceNavToolCall {
  tool: 'navigate';
  args: VoiceNavigateArgs;
}
export interface VoiceContinueWalkToolCall {
  tool: 'continue_walk';
  args: VoiceContinueWalkArgs;
}

/** Args returned by the server after executing a sermon search. */
export interface VoiceSearchSermonsArgs {
  /** TTS-ready sentence describing the result(s). */
  spokenText: string;
  sermonResults: import('./emmaus-client').SermonRecommendation[];
}
export interface VoiceSearchSermonsToolCall {
  tool: 'search_sermons';
  args: VoiceSearchSermonsArgs;
}

export type AnyVoiceToolCall = VoiceToolCall | VoiceNavToolCall | VoiceContinueWalkToolCall | VoiceSearchSermonsToolCall;

export interface VoiceConversationCallbacks {
  /** Called for each streamed text chunk from the LLM. For display only — use onSentence for TTS. */
  onText: (chunk: string) => void;
  /**
   * Called for each complete sentence detected server-side as the LLM streams.
   * Sentences arrive as soon as a sentence boundary (. ! ?) is detected, well
   * before the stream ends, enabling sequential TTS playback.
   * Only emitted for conversational (non-tool-call) responses.
   * Optional — if absent the caller should fall back to onDone + single TTS.
   */
  onSentence?: (sentence: string) => void;
  /** Called when the LLM decides to call a tool. Emitted after stream ends. */

  onToolCall: (tc: AnyVoiceToolCall) => void;
  /** Called when the stream completes successfully. */

  onDone: (fullText: string, hadToolCall: boolean) => void;
  /** Called on fetch or parse error. */

  onError: (msg: string) => void;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Stream a voice conversation request to the server and dispatch SSE events
 * to the provided callbacks.
 *
 * Returns an { abort } handle. Call abort() to cancel mid-stream.
 */
export function sendVoiceConversation(params: {
  message:          string;
  userId:           string;
  context?:         object;
  history?:         Array<{ role: string; content: string }>;
  voiceAppContext?:  string;
  isReading?:        boolean;
  /** Sections from the most recently completed reading — enables post-reading follow-up questions. */
  lastReadContext?:  string;
  callbacks:         VoiceConversationCallbacks;
}): { abort: () => void } {
  const controller = new AbortController();

  async function run() {
    try {
      const resp = await fetch(`${API_BASE}/api/voice/conversation`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({
          message:         params.message,
          context:         params.context,
          history:         (params.history ?? []).slice(-6),
          voiceAppContext: params.voiceAppContext,
          isReading:       params.isReading ?? false,
          lastReadContext: params.lastReadContext,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        params.callbacks.onError(err.error ?? `Voice conversation failed (${resp.status})`);
        return;
      }

      if (!resp.body) {
        params.callbacks.onError('No response body from voice conversation endpoint');
        return;
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf  = '';
      let fullText    = '';
      let hadToolCall = false;

      const pendingTools: AnyVoiceToolCall[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const raw = line.slice(6);
            const evt = JSON.parse(raw) as {
              type:    string;
              content?: string;
              tool?:   string;
              args?:   Record<string, unknown>;
              text?:   string;
              message?: string;
            };

            if (evt.type === 'text' && evt.content) {
              fullText += evt.content;
              params.callbacks.onText(evt.content);
            } else if (evt.type === 'sentence' && evt.content) {
              params.callbacks.onSentence?.(evt.content);
            } else if (evt.type === 'tool_call' && evt.tool) {
              hadToolCall = true;
              const tc = { tool: evt.tool, args: evt.args ?? {} } as unknown as AnyVoiceToolCall;
              pendingTools.push(tc);
              params.callbacks.onToolCall(tc);
            } else if (evt.type === 'done') {
              // done handled after loop
            } else if (evt.type === 'error') {
              params.callbacks.onError(evt.message ?? 'Unknown error from voice conversation');
              return;
            }
          } catch { /* skip malformed line */ }
        }
      }

      params.callbacks.onDone(fullText, hadToolCall);

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      params.callbacks.onError(
        err instanceof Error ? err.message : 'Voice conversation request failed',
      );
    }
  }

  run();
  return { abort: () => controller.abort() };
}
