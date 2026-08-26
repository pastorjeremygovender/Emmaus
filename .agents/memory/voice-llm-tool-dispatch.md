---
name: Voice canonical service boundary
description: Voice conversation is a transport adapter around canonical Emmaus intelligence; deterministic client actions remain only for low-latency controls.
---

## Boundary

`POST /api/voice/conversation` delegates to the canonical Emmaus conversation service. The canonical service owns persona, Scripture-first retrieval, sermon/resource validation, safety, citations, and persistence; Voice only adapts the request and SSE transport.

The server builds a verified Voice context envelope from authenticated identity and validated route/activity hints. Browser names, IDs, URLs, and audio paths are never authoritative.

The client helper consumes canonical SSE `done` metadata, including the persistent conversation ID and verified sermon recommendations.

**Client dispatch**: `VoiceSessionContext.tsx → processAudioBlob`
- Fast-path regex kept for: `reading-command`, `navigate`, `continue-reading` (deterministic, zero-latency).
- Everything ambiguous or conversational → `sendVoiceConversation`.
- `read_content`: maps `bibleBook`+`bibleChapter` → `loadAndStartReading()`; no TTS of text.
- `navigate`: TTS brief confirmation text first (if any), then navigate, then mic restarts.
- No tool: accumulate text → `playTTS()` → auto-restart listening (same as old Ask Emmaus path).
- The client keeps short local history for responsiveness while the canonical service persists authenticated turns.

## Key decisions

**Why gpt-4o not OPENAI_MODEL?** Voice needs fast responses (seconds). If `OPENAI_MODEL` is set to gpt-5, that's 90–150s/call — unusable for voice. Separate env var `VOICE_CONV_MODEL` allows override.

**Why execute tool after stream ends?** Tool calls are emitted at stream end (finishReason check). Trying to `await` inside `onToolCall` creates async collision with the outer promise. Clean separation: collect, then execute.

**Why keep navigate in fast-path regex?** Navigate regex is already comprehensive and adds zero latency. The LLM navigate tool is a fallback for phrases the regex misses — having both is fine (regex fires first and returns early).

**Why persist through Emmaus?** Voice and text must share the same conversation, retrieval, safety, and authorization behavior instead of creating two assistants with different answers.

## Sprint 3 additions (sentence streaming + smart walk)

**Sentence streaming** (Task #508):
- Server emits `{ type: 'sentence', content }` SSE events as sentence boundaries are detected mid-stream (regex: `/[^.!?]*[.!?]+\s+/g`; remaining buffer flushed at `done`)
- Client (`voice-conversation-client.ts`) fires `onSentence?` callback per sentence
- `processAudioBlob` adds `drainSentences()` inner async function: prefetches TTS per sentence, plays sequentially, restarts mic after last sentence's `onended`
- Falls back to single `playTTS(fullResponse)` if no sentence events received (e.g. very short reply)
- `allDonePromise` / `resolveAllDone` synchronisation pattern: SSE promise resolves first, then `await allDonePromise` waits for TTS drain

**Smart walk continuation** (Task #509):
- Added `continue_walk` tool (3rd tool) to `VOICE_TOOLS` in voice.ts — no parameters; description steers LLM away from `navigate` for walk continuation
- Client dispatch: reads `appContextRef.current?.activeWalks`; navigates to `/journey/{id}/day/{day}` if single match; falls back to `/journeys` if multiple; speaks error if none
- `args.hint` allows LLM to name-match when user says "my Psalms journey"
