---
name: ElevenLabs Voice Integration
description: ElevenLabs STT + TTS wired into voice-service.ts as primary provider; OpenAI is fallback.
---

## Rule
`voice-service.ts` is the single abstraction layer. Callers (`voice.ts` routes) never reference the provider directly.

## Provider selection (runtime)
- If `ELEVENLABS_API_KEY` is set → ElevenLabs for both STT and TTS (no silent fallback on hard failures)
- If not → OpenAI whisper-1 (STT) + tts-1 (TTS)

## ElevenLabs specifics
- STT: POST `https://api.elevenlabs.io/v1/speech-to-text`, model `scribe_v1`, header `xi-api-key`
- TTS: POST `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=mp3_44100_128`, model `eleven_turbo_v2_5`
- Voice ID map (OpenAI name → EL ID): nova=EXAVITQu4vr4xnSDxMaL (Sarah), shimmer=21m00Tcm4TlvDq8ikWAM (Rachel), alloy=pNInz6obpgDQGcFmaJgB, echo=ErXwobaYiN019PkySvjV, fable=N2lVS1w4EtoT3dr4eOWO, onyx=VR6AewLTigWG4xSOukaG
- ElevenLabs does NOT have a direct speed param — voice_settings stability/similarity used instead

## Logging added
- `[VOICE ELEVENLABS] apiKeyConfigured=true/false` — emitted by `initVoiceSettings()` on every boot
- `[VOICE STT] provider=... model=... audioDurationMs=N/A transcriptionLatencyMs=... transcript=...` — emitted by `transcribeAudioBase64`
- `voice: TTS ok` now includes `provider` and `timeToFirstAudio` fields
- `[VOICE READING START]` — emitted client-side (browser console) in `loadAndStartReading` before first section plays; includes content, entry, sectionsTotal, initialSectionIndex (always 0 for new reads), initialSectionLabel

**Why:** `audioDurationMs` is logged as `'N/A'` — ElevenLabs API does not return audio duration in the transcription response and the server only sees base64 bytes, not the decoded PCM length.
