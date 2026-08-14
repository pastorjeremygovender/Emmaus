---
name: Voice reader state machine
description: Root causes and fixes for section-continuation stalling and phantom transcripts after TTS in VoiceSessionContext.
---

## Section continuation stalling (reads only first section)

**Root cause**: `playTTS` `onended` always called `startListening()`, then relied on the chain mic → VAD silence → empty transcript → `advanceReading()`. VAD silence only fires after `vadSpokenRef` becomes true (5 consecutive ticks above threshold 35), which never happens in a quiet room. Result: recorder never stops, advanceReading never called, reader stalls after section 0.

**Fix**: In the `onended` timer callback, when `isReadingSection && isReadingRef.current && !readingPausedRef.current`, call `advanceReading()` directly and return. Do NOT go through `startListening()` between reading sections. Only call `startListening()` for conversation TTS or end-of-reading.

**Why**: The mic→VAD→silence→empty-transcript path was never reliable for structured reading — it was designed for silence detection of REAL speech. Direct advance eliminates mic activation between sections entirely, which also prevents phantom transcripts during reading.

**Timer delay**: Changed from 1500ms to 800ms for between-section advance (no need to wait for VAD).

## Phantom transcript after TTS ("you", "okay", etc.)

**Root cause**: After TTS ended, mic opened after 1500ms, captured residual speaker echo. Whisper hallucinated short words ("you", "okay") from near-silence. The transcript dispatched to Ask Emmaus, triggering an unrelated conversational response.

**Evidence from production logs**: `chars:3, msg="you"` → Ask Emmaus → Romans 9 response.

**Fixes applied**:
1. `vadSpokenRef.current = false` + `vadSilenceStartRef.current = null` reset at start of every `startListening()` call — prevents stale `vadSpoken=true` from a previous session carrying over.
2. Echo cancellation (`echoCancellation: true, noiseSuppression: true, autoGainControl: true`) added to main `startListening()` getUserMedia — mirrors interrupt monitor constraints.
3. Pre-transcription validation in `processAudioBlob`: reject if `!vadSpokenRef.current` OR `blob.size < 3000`. Logs `[VOICE INPUT TRACE]` with `rejectReason: 'no_vad_speech_detected' | 'blob_too_small'`.
4. Rejected clips: if reading → `advanceReading()`; else → restart listening after 500ms. Never send to Ask Emmaus.

**Important**: Reject the audio EVENT, not words. A real user saying "you" must still be accepted — it passes because VAD fires (genuine speech) and the blob is large enough.

## Trace logs added
- `[VOICE READER TRACE]` — emitted by `playReadingSection` for every section: sectionsTotal, currentSectionIndex, currentSectionLabel, nextSectionExists, readerState.
- `[VOICE INPUT TRACE]` — emitted before every transcription: timeSinceTtsEnded, audioDurationMs, audioBytes, vadSpeechDetected, accepted, rejectReason.

## What NOT to change
- Barge-in path (`startListeningFromCapture`) bypasses VAD — the blob validation applies only to the main `startListening` path.
- `advanceReading()` in `processAudioBlob` (empty transcript path, line ~993) is kept as a safety net.
- VAD thresholds (35 threshold, 5 consecutive ticks) must not be lowered — see existing comments.
