---
name: Voice interrupt architecture
description: Tuned values and structural rules for the barge-in / interrupt monitor in VoiceSessionContext. Required reading before touching any interrupt, sentence-queue, or TTS pipeline code.
---

# Voice interrupt architecture

## Timing values (do not lower without testing)
- **Startup delay**: 1000 ms — time before the monitor starts polling after `getUserMedia`. AEC (echo cancellation) locks in ~200–400 ms; 1000 ms prevents TTS bleed false-triggers.
- **Speech gate**: 600 ms — user must sustain audio > threshold for this long before interrupt fires. Below ~500 ms risks transient noise triggers.
- **Amplitude threshold**: 40 — empirically stable. Lower values (≤ 25) caused TTS bleed to self-trigger immediately.

**Why:** 3000 ms startup + 1500 ms gate meant the monitor never activated during short responses (<3 s), and users perceived it as "broken after a few uses."

## Monitor must start BEFORE the LLM call (not inside playReadingSection)
- `startInterruptMonitor` is called at the top of the LLM dispatch section in `processAudioBlob`, *before* `sendVoiceConversation`.
- The startup delay then elapses during LLM latency (free time) — monitor is active when TTS starts.
- `playReadingSection` also calls `startInterruptMonitor`, but the `if (intStreamRef.current) return` guard makes it idempotent.
- **Why:** The old placement (only in `playReadingSection`) meant conversational TTS could never be interrupted.

## Sentence drain must stop on interrupt (`interruptFired` flag)
- Local `let interruptFired = false` is declared before `sendVoiceConversation`.
- Set to `true` in the interrupt callback (same closure), checked in `drainAndPlaySentences` and `enqueueSentence`.
- Without it, the old drain loop continues and tries to play the next queued sentence over the new recording.
- `abortRef.current?.()` is also called in the interrupt callback to kill the in-flight LLM SSE stream.

## `stopAudioElement()` vs `stopAudio()` between sections
- `stopAudioElement()` — clears audio element only, leaves interrupt monitor alive. Use between reading sections.
- `stopAudio()` — stops monitor + audio element. Use when reading ends naturally or on barge-in.

## Opening greeting
- `buildOpeningGreeting(ctx, name)` — pure function, generates greeting from `VoiceAppContext`. Returns `null` if no content.
- `playGreeting(text)` — component-level async function. Plays TTS then calls `startListening()`. Silently skips to `startListening()` if TTS fails or autoplay is blocked (`NotAllowedError`).
- Called from `startSession` after `fetchVoiceContext` resolves.

## Voice sermon search tool
- `search_sermons` tool added to `VOICE_TOOLS` in voice.ts.
- Resolved server-side in `resolveSearchSermons(query)` — calls `searchSermons()` from `lib/sermon-search.ts`, formats a TTS-ready spoken summary, returns `{ spokenText, navigateRoute }`.
- Client handles it in `processAudioBlob`: speaks `spokenText`, navigates to `navigateRoute` (typically `/discover?q=<query>`).
- Types in `voice-conversation-client.ts`: `VoiceSearchSermonsArgs`, `VoiceSearchSermonsToolCall` added to `AnyVoiceToolCall`.
