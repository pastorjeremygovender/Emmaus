/**
 * voice.ts — Emmaus Voice API routes.
 *
 *   POST /api/voice/transcribe   — Convert recorded audio to text (auth required)
 *   POST /api/voice/speak        — Convert text to speech, streams audio/mpeg (auth required)
 *   GET  /api/voice/settings     — Read current voice settings (auth required)
 *   PUT  /api/voice/settings     — Update voice settings (admin required)
 *
 * Audio is sent as base64 JSON to keep the client simple (no multipart).
 * TTS audio is streamed directly from OpenAI to the client.
 */

import { Router } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";
import {
  transcribeAudioBase64,
  fetchSpeechStream,
  getVoiceSettings,
  updateVoiceSettings,
  getProviderStatus,
  checkVoiceRateLimit,
  type VoiceId,
} from "../lib/voice-service.js";

const router = Router();

// ─── POST /voice/transcribe ───────────────────────────────────────────────────

router.post("/voice/transcribe", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };

  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "audio (base64 string) is required" });
    return;
  }

  if (audio.length > 20_000_000) {
    // ~15 MB decoded — guard against huge uploads
    res.status(413).json({ error: "Audio too large (max ~15 MB)" });
    return;
  }

  // Per-user rate limit — prevents cost abuse from any single authenticated identity
  if (!checkVoiceRateLimit(userId)) {
    res.status(429).json({ error: "Too many voice requests. Please wait a moment before trying again." });
    return;
  }

  // Enforce the admin-controlled enabled flag — transcription is the first
  // billable step, so it must be gated even if TTS is separately disabled.
  const voiceSettings = getVoiceSettings();
  if (!voiceSettings.enabled) {
    res.status(503).json({ error: "Voice mode is currently disabled by your admin." });
    return;
  }

  const status = getProviderStatus();
  if (!status.available) {
    res.status(503).json({ error: status.reason ?? "Transcription not available" });
    return;
  }

  const start = Date.now();
  try {
    const transcript = await transcribeAudioBase64(
      audio,
      mimeType ?? "audio/webm",
    );
    logger.info(
      { userId, chars: transcript.length, ms: Date.now() - start },
      "voice: transcription ok",
    );
    res.json({ transcript });
  } catch (err) {
    logger.warn({ err, userId, ms: Date.now() - start }, "voice: transcription failed");
    res.status(500).json({ error: "Transcription is not available right now. Please try again." });
  }
});

// ─── POST /voice/speak ────────────────────────────────────────────────────────

router.post("/voice/speak", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Only 'text' is accepted from callers — voice and speed are always taken
  // from admin settings to prevent per-request overrides.
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  // Per-user rate limit — share the same window as transcribe
  if (!checkVoiceRateLimit(userId)) {
    res.status(429).json({ error: "Too many voice requests. Please wait a moment before trying again." });
    return;
  }

  const settings = getVoiceSettings();

  if (!settings.enabled) {
    res.status(503).json({ error: "Voice is currently disabled" });
    return;
  }

  const status = getProviderStatus();
  if (!status.available) {
    res.status(503).json({ error: status.reason ?? "Speech not available" });
    return;
  }

  // Voice and speed are admin-controlled — callers cannot override them.
  const { voice, speed } = settings;

  const start = Date.now();
  try {
    const ttsResp = await fetchSpeechStream(text, voice, speed);

    logger.info(
      { userId, textLen: Math.min(text.length, 4000), voice, ms: Date.now() - start },
      "voice: TTS ok",
    );

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    // Pipe the OpenAI response stream directly to the client
    const reader = ttsResp.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();
  } catch (err) {
    logger.warn({ err, userId, ms: Date.now() - start }, "voice: TTS failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Voice playback is not available right now." });
    } else {
      res.end();
    }
  }
});

// ─── GET /voice/settings ──────────────────────────────────────────────────────

router.get("/voice/settings", (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  res.json(getVoiceSettings());
});

// ─── PUT /voice/settings ──────────────────────────────────────────────────────

router.put("/voice/settings", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { enabled, voice, speed } = req.body as {
    enabled?: boolean;
    voice?: string;
    speed?: number;
  };

  try {
    const updated = await updateVoiceSettings({
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(voice ? { voice: voice as VoiceId } : {}),
      ...(typeof speed === "number" ? { speed } : {}),
    });
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

export default router;
