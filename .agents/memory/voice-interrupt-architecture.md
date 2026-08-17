---
name: Voice interrupt architecture
description: Tuned values and structural rules for the barge-in / interrupt monitor in VoiceSessionContext. Required reading before touching any interrupt, sentence-queue, or TTS pipeline code.
---

# Voice interrupt architecture

## Timing values (Sprint 3 — 2026-08-17, ambient-noise fix)
Current tuned values for device-mic-without-earphones, optimised for conversational cadence AND rejecting ambient TV/room audio:

| Constant | Value | Notes |
|---|---|---|
| Interrupt startup delay | 600 ms | Was 1000 ms. AEC locks in 200–400 ms; 600 ms is a safe margin that allows barge-in on short TTS replies. |
| Interrupt speech gate | 350 ms | Was 600 ms. Rejects transient knocks, still feels instant. |
| Interrupt amplitude threshold | 36 | Was 40. More sensitive for device mic at arm's length; AEC prevents bleed-through at this level. |
| VAD silence gate | 800 ms | Was 1200 ms. Mid-sentence pauses are 200–500 ms; 800 ms avoids cutting off natural speech. |
| VAD min elapsed | 1000 ms | Was 1500 ms. Allows auto-stop sooner on short utterances. |
| VAD amplitude threshold | **50** | Was 35. TV at normal room volume sits below 50; a person speaking to the device is above it. Do NOT lower below 45. |
| VAD consecutive ticks | **6** (≈600 ms) | Was 3. Requires ~600 ms of sustained speech before VAD locks in — rejects TV audio bursts, door slams, etc. Do NOT lower below 4. |
| Post-TTS conversational mic delay | 350 ms | Was 1000 ms. Major responsiveness gain for back-and-forth conversation. |
| Post-TTS section advance delay | 250 ms | Was 800 ms. Pacing between reading sections; bypasses mic entirely. |
| Post-reading complete mic delay | 600 ms | Was 1500 ms. Opens mic promptly for follow-up questions after reading ends. |

**Why threshold was raised:** Real-world use with TV on in background — VAD threshold 35 + 3 ticks (~300 ms) was picked up TV speech and triggering false transcription. 50 + 6 ticks ensures only direct device speech triggers VAD. Both startListening and startListeningFromCapture (barge-in path) use the same threshold.

**Why these were lowered (Sprint 2):** Previous values were conservative guard rails from early development; real-world testing showed they made the conversation feel sluggish and unnatural. AEC + noiseSuppression + autoGainControl on the main mic stream (added Sprint 2) makes lower thresholds safe.

## Main mic now requests AEC explicitly
`startListening()` previously used `{ audio: true }`. Now requests:
```
{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }
```
Critical for device-speaker-without-earphones scenarios — prevents TTS bleed triggering false VAD events.

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

## ElevenLabs voice settings (Sprint 2)
`voice-service.ts` `fetchSpeechStreamElevenLabs`:
- `stability: 0.25` (was 0.45) — more expressive, natural delivery; lower = less rigid monotone
- `style: 0.20` (was 0.0) — adds human inflection; 0.0 sounded robotic
- `similarity_boost: 0.80` — unchanged
- `use_speaker_boost: true` — unchanged
- Speed parameter from DB settings is still NOT sent to ElevenLabs (eleven_turbo_v2_5 has no direct speed param in this API shape); this is a known limitation.

## iOS one-stream constraint (known limitation)
iOS only allows one concurrent `getUserMedia` stream. If the main recording stream is open, `startInterruptMonitor` will fail silently. Orb-tap (SPEAKING → startListening) remains the iOS barge-in fallback. No fix attempted — requires MediaSession or AudioWorklet approach.
