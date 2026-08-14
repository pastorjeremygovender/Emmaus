---
name: Voice LLM tool dispatch
description: Sprint 2 architecture — POST /api/voice/conversation endpoint with OpenAI tool calling replaces client-side regex intent classifier for natural-language voice routing.
---

## What was built

**Server**: `POST /api/voice/conversation` added at the end of `artifacts/api-server/src/routes/voice.ts`.
- Uses `OpenAI` directly (same OPENAI_API_KEY as voice-service.ts, NOT via Replit proxy).
- Model: `VOICE_CONV_MODEL` env var, defaults to `gpt-4o` (NOT `OPENAI_MODEL` — avoids gpt-5 slow path).
- Two tools defined: `read_content` and `navigate`.
- SSE events: `{ type: 'text', content }` | `{ type: 'tool_call', tool, args }` | `{ type: 'done', text }` | `{ type: 'error', message }`.
- `max_completion_tokens: 300` — voice responses must be short.
- Tool_call events emitted when `finish_reason === 'tool_calls' || 'stop'`.

**Client helper**: `artifacts/project-emmaus/src/lib/voice-conversation-client.ts`
- `sendVoiceConversation({ message, userId, history, voiceAppContext, isReading, callbacks })` → `{ abort }`.
- Callbacks: `onText`, `onToolCall`, `onDone(fullText, hadToolCall)`, `onError`.
- Type cast for tool_call requires `as unknown as AnyVoiceToolCall` — TypeScript limitation with union narrowing.

**Client dispatch**: `VoiceSessionContext.tsx → processAudioBlob`
- Fast-path regex kept for: `reading-command`, `navigate`, `continue-reading` (deterministic, zero-latency).
- Everything else (read-content, continue-walk, get-steps, converse) → `sendVoiceConversation`.
- Tool call collected during stream, executed AFTER `onDone` fires (avoids async collision with TTS).
- `read_content`: maps `bibleBook`+`bibleChapter` → `loadAndStartReading()`; no TTS of text.
- `navigate`: TTS brief confirmation text first (if any), then navigate, then mic restarts.
- No tool: accumulate text → `playTTS()` → auto-restart listening (same as old Ask Emmaus path).
- Conversation history updated in local `history` state (not Emmaus persistent store) for voice turns.

## Key decisions

**Why gpt-4o not OPENAI_MODEL?** Voice needs fast responses (seconds). If `OPENAI_MODEL` is set to gpt-5, that's 90–150s/call — unusable for voice. Separate env var `VOICE_CONV_MODEL` allows override.

**Why execute tool after stream ends?** Tool calls are emitted at stream end (finishReason check). Trying to `await` inside `onToolCall` creates async collision with the outer promise. Clean separation: collect, then execute.

**Why keep navigate in fast-path regex?** Navigate regex is already comprehensive and adds zero latency. The LLM navigate tool is a fallback for phrases the regex misses — having both is fine (regex fires first and returns early).

**Why not persist voice conversations to Emmaus store?** Voice sessions are ephemeral. History in `history` state provides multi-turn context within the session. Persistence to Firestore/in-memory store is separate concern (Task #13).

## What Sprint 3 needs

- ElevenLabs STT + TTS swap (dismissed in prior session — needs reconnection or separate API key)
- Or: keep OpenAI STT/TTS, focus on streaming improvements (sentence-boundary TTS flushing)
