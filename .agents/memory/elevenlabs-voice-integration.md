---
name: ElevenLabs Voice Integration
description: Voice provider boundary: device speech is normal output, OpenAI transcription is normal input, paid TTS is explicit comparison-only.
---

## Rule
`voice-service.ts` is the single abstraction layer. Callers (`voice.ts` routes) never reference the provider directly.

## Provider selection (runtime)
- Normal members use OpenAI `gpt-4o-mini-transcribe` for STT and browser/device speech synthesis for TTS.
- OpenAI TTS and ElevenLabs TTS are admin/test comparison providers only; ElevenLabs must have both the persisted setting and an explicit server feature gate.
- Provider keys are never sent to the browser.

## ElevenLabs specifics
- STT: POST `https://api.elevenlabs.io/v1/speech-to-text`, model `scribe_v1`, header `xi-api-key`
- TTS: POST `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=mp3_44100_128`, model `eleven_turbo_v2_5`
- Voice ID map (OpenAI name → EL ID): nova=EXAVITQu4vr4xnSDxMaL (Sarah), shimmer=21m00Tcm4TlvDq8ikWAM (Rachel), alloy=pNInz6obpgDQGcFmaJgB, echo=ErXwobaYiN019PkySvjV, fable=N2lVS1w4EtoT3dr4eOWO, onyx=VR6AewLTigWG4xSOukaG
- ElevenLabs does NOT have a direct speed param — voice_settings stability/similarity used instead

## Logging added
- Startup logs provider availability and the normal-user policy without printing credentials.
- `[VOICE STT] provider=... model=... audioDurationMs=N/A transcriptionLatencyMs=... transcript=...` — emitted by `transcribeAudioBase64`
- `voice: TTS ok` now includes `provider` and `timeToFirstAudio` fields
- `[VOICE READING START]` — emitted client-side (browser console) in `loadAndStartReading` before first section plays; includes content, entry, sectionsTotal, initialSectionIndex (always 0 for new reads), initialSectionLabel

**Why:** Normal Voice traffic should remain low-cost and provider-neutral even when a paid-provider key exists in the environment; comparison access must be deliberate and auditable.

**How to apply:** Keep provider selection inside `voice-service.ts`, keep normal playback in the device speech helper, and treat any server TTS call as an admin comparison that is uncached and metered.
