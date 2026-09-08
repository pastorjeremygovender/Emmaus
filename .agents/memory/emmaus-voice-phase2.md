---
name: Emmaus Voice Phase 2 — Continuous conversation loop
description: Architecture of the auto-restart hands-free voice conversation loop in VoiceMode.tsx
---

## Auto-restart loop

After Emmaus finishes speaking, `audio.onended` schedules a 600 ms timer via `autoRestartTimerRef`, then calls `startListening()`. The 600 ms gives a natural pause.

`autoRestartTimerRef` is cancelled in:
- `cleanupAll()` (unmount / End button)
- `handleOrbTap()` — user manually taps orb before timer fires

## Mic/TTS mutual exclusion

`recorder.onstop` calls `stopMicStream()` (stops all MediaStream tracks) BEFORE the async pipeline starts. This guarantees Emmaus cannot transcribe its own TTS output. The mic is not reopened until `audio.onended` fires and the 600 ms auto-restart delay completes.

**Why:** stopMicStream is synchronous and runs in recorder.onstop — the very next thing after the user stops speaking. The async chain (transcribe → SSE → TTS fetch → audio.play) all happen after the mic is already closed.

## State machine

```
READY → (orb tap) → LISTENING → (stop) → THINKING → SPEAKING → (audio.onended) → READY → (600ms) → LISTENING
                                                                               ↑
                                   (autoplay blocked)                      manual re-tap
```

SPEAKING + orb tap = interrupt: `stopAudio()` → `startListening()` immediately (no auto-restart timer).

## Fallbacks

- **Autoplay blocked (iOS Safari)**: blob URL kept, `autoplayBlocked = true`, "Tap to hear Emmaus" button shown. After user taps and audio plays, `audio.onended` fires → same 600ms auto-restart.
- **TTS fetch error**: `ttsError = true`, response text stays visible, "Retry audio" button. No auto-restart until user retries and audio completes.
- **Empty/silent transcript**: goes to ERROR with "I didn't catch that", not auto-restart.
- **Mid-play audio error**: goes to READY (no auto-restart; edge case).

## Conversation history panel

`showHistory` state + slide-up panel. History array (`HistoryItem[]`) is the same object used by the existing Ask Emmaus SSE pipeline — no duplicate storage. Conversation view button (MessageSquare icon) in header, disabled when history is empty.

## Key invariants

- `cancelledRef.current = true` is set before `cleanupAll()` on unmount — all async callbacks check this before proceeding.
- `autoRestartTimerRef` is always cancelled before any new recording starts.
- `processAudioBlob` is a useCallback with `[user, convId, history, initContext]` deps. `startListening` captured in the closure is safe because it only uses stable state setters and refs.

## Files changed in Phase 2

- `artifacts/project-emmaus/src/components/emmaus/VoiceMode.tsx` — full rewrite (logic preserved, auto-restart added, canvas removed, orb UI, history panel)
- `artifacts/project-emmaus/src/index.css` — added `@keyframes voice-breathe` + `.animate-voice-breathe` class
