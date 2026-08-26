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

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { handleConversation, setSseHeaders } from "../emmaus/conversation-service.js";
import { toEmmausContextInput } from "../emmaus/context-builder.js";
import {
  buildVoiceContextEnvelope,
  normalizeVoiceHistory,
  type VoiceConversationRequest,
} from "../emmaus/voice-contracts.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";
import {
  transcribeAudioBase64,
  fetchSpeechStream,
  getVoiceSettings,
  updateVoiceSettings,
  getProviderStatus,
  checkVoiceRateLimit,
  checkTTSRateLimit,
  type VoiceId,
} from "../lib/voice-service.js";
import {
  listPublishedJourneys,
  getAllProgress,
  listSteps,
  getStep,
  type FrontendJourney,
  type FrontendProgress,
  type FrontendStep,
} from "../lib/journey-store.js";
import {
  getAllProgressForUser,
  listPublishedSeries,
  getSeriesById,
  type DevotionalProgress,
  type DevotionalSeries,
} from "../lib/devotional-store.js";
import {
  getCurrentWeekPublicCompanion,
  getEntriesForCompanion,
  getProgressForUser,
  type CompanionEntry,
} from "../lib/sermon-companion-store.js";

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

  // TTS gets its own higher rate limit (40/min) separate from STT+LLM (10/min).
  // Structured reading fires 5 TTS calls in rapid succession (one per content section).
  // Sharing the STT/LLM bucket caused 429s mid-reading after only 2 sessions.
  if (!checkTTSRateLimit(userId)) {
    res.status(429).json({ error: "Too many speech requests. Please wait a moment before trying again." });
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

  const textReadyAt = Date.now();
  const provider    = process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'openai';
  try {
    const ttsResp = await fetchSpeechStream(text, voice, speed);
    const firstAudioChunkAt = Date.now();

    logger.info({
      userId,
      provider,
      voice,
      textLen:          Math.min(text.length, 5000),
      timeToFirstAudio: firstAudioChunkAt - textReadyAt,
    }, "voice: TTS ok");

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    // Pipe the TTS response stream directly to the client
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
    logger.warn({ err, userId, ms: Date.now() - textReadyAt }, "voice: TTS failed");
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

  const { enabled, voice, speed, vadThreshold, vadTicks } = req.body as {
    enabled?: boolean;
    voice?: string;
    speed?: number;
    vadThreshold?: number;
    vadTicks?: number;
  };

  try {
    const updated = await updateVoiceSettings({
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(voice ? { voice: voice as VoiceId } : {}),
      ...(typeof speed === "number" ? { speed } : {}),
      ...(typeof vadThreshold === "number" ? { vadThreshold } : {}),
      ...(typeof vadTicks === "number" ? { vadTicks } : {}),
    });
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// ─── GET /voice/context ──────────────────────────────────────────────────────
/**
 * Returns a snapshot of the authenticated user's active Emmaus content:
 * daily rhythm step, active devotionals, active walks, and sermon companion.
 *
 * Called ONCE at Voice Mode session start so the reading engine and Emmaus
 * context enrichment can answer "what's on today's steps?" without requiring
 * the user to be on any particular page.
 *
 * Cache-Control: no-store — user content changes frequently.
 */
router.get("/voice/context", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    // ── 1. Parallel fetch of all content sources ─────────────────────────────
    const [allJourneys, allProgress, devotionalProgresses, publishedSeries, companion] =
      await Promise.all([
        listPublishedJourneys().catch((): FrontendJourney[] => []),
        getAllProgress(userId).catch((): Record<string, FrontendProgress> => ({})),
        getAllProgressForUser(userId).catch((): DevotionalProgress[] => []),
        listPublishedSeries().catch((): DevotionalSeries[] => []),
        getCurrentWeekPublicCompanion().catch(() => null),
      ]);

    // ── 2. Daily Rhythm ──────────────────────────────────────────────────────
    const drJourney = allJourneys.find((j) => j.journeyType === "daily-rhythm");
    let dailyRhythm: {
      journeyId: string; journeyTitle: string; currentDay: number; totalDays: number;
      stepTitle: string; stepScripture: string; stepTeaching: string;
      stepReflection: string; stepPrayer: string;
    } | null = null;

    if (drJourney) {
      const steps    = await listSteps(drJourney.id).catch((): FrontendStep[] => []);
      const published = steps.filter((e) => e.status === "Published");
      const prog      = allProgress[drJourney.id];
      const maxDay    = steps.reduce((m, e) => Math.max(m, e.day), 0);
      const currentDay = prog?.currentDay ?? 1;
      const step      = published.find((s) => s.day === currentDay);
      logger.info({
        journeyId:    drJourney.id,
        journeyTitle: drJourney.title,
        stepsTotal:   steps.length,
        publishedSteps: published.length,
        progStatus:   prog?.status ?? 'none',
        currentDay,
        stepFound:    !!step,
        stepTitle:    step?.title ?? null,
      }, '[VOICE CONTENT TRACE] daily-rhythm resolution');
      if (step) {
        dailyRhythm = {
          journeyId:    drJourney.id,
          journeyTitle: drJourney.title,
          currentDay,
          totalDays:    maxDay,
          stepTitle:     step.title ?? "",
          stepScripture: step.scripture ?? "",
          stepTeaching:  step.devotional ?? "",
          stepReflection: step.reflectionQuestion ?? "",
          stepPrayer:    step.prayerPrompt ?? "",
        };
      }
    }

    // ── 3. Active Devotionals ────────────────────────────────────────────────
    const activeDevotionals: {
      seriesId: string; seriesTitle: string; currentDay: number; totalDays: number;
      entryTitle: string; entryScripture: string; entryContent: string; entryPrayer: string;
    }[] = [];

    for (const prog of devotionalProgresses) {
      if (prog.status === "paused") continue;
      const series = publishedSeries.find((s) => s.id === prog.seriesId);
      if (!series) continue;
      const full = await getSeriesById(prog.seriesId).catch(() => null);
      if (!full) continue;
      const entries = full.entries.filter((e) => e.status === "Published");
      const maxDay = entries.reduce((m, e) => Math.max(m, e.dayNumber), 0);
      const currentDay = prog?.currentDay ?? 1;
      const entry = entries.find((e) => e.dayNumber === currentDay);
      activeDevotionals.push({
        seriesId:     prog.seriesId,
        seriesTitle:  series.title,
        currentDay,
        totalDays:    maxDay,
        entryTitle:   entry?.title ?? `Day ${currentDay}`,
        entryScripture: entry?.scriptureReference ?? "",
        entryContent:   entry?.considerThis ?? "",
        entryPrayer:    entry?.prayer ?? "",
      });
    }

    // ── 4. Sermon Companion ──────────────────────────────────────────────────
    let sermonCompanion: {
      id: string; title: string; currentDay: number; totalDays: number;
      entryTitle: string; entryScripture: string; entryGreeting: string;
      entryReflection: string; entryPrayer: string; entryClosing: string;
    } | null = null;

    if (companion) {
      const [progress, entries] = await Promise.all([
        getProgressForUser(userId, companion.id).catch(() => null),
        getEntriesForCompanion(companion.id).catch((): CompanionEntry[] => []),
      ]);
      const published = entries.filter((e) => e.status === "Published");
      const currentDay = progress?.currentDay ?? 1;
      const entry = published.find((e) => e.dayNumber === currentDay);
      sermonCompanion = {
        id:            companion.id,
        title:         companion.title,
        currentDay,
        totalDays:     published.length,
        entryTitle:    entry?.title ?? `Day ${currentDay}`,
        entryScripture:  entry?.scriptureReference ?? "",
        entryGreeting:   entry?.greeting ?? "",
        entryReflection: entry?.reflection ?? "",
        entryPrayer:     entry?.prayer ?? "",
        entryClosing:    entry?.closing ?? "",
      };
    }

    // ── 5. Active Walks (non-DR, started, not paused) ────────────────────────
    // Fetch step content in parallel so Voice can read walk steps aloud.
    const activeWalksRaw = allJourneys
      .filter((j) => j.journeyType !== "daily-rhythm")
      .filter((j) => {
        const prog = allProgress[j.id];
        return prog !== undefined && prog.status !== "paused";
      });

    const activeWalks = await Promise.all(
      activeWalksRaw.map(async (j) => {
        const currentDay = allProgress[j.id]?.currentDay ?? 1;
        const step = await getStep(j.id, currentDay).catch(() => null);
        return {
          journeyId:  j.id,
          title:      j.title,
          slug:       j.id,
          currentDay,
          totalDays:  j.durationDays ?? 0,
          stepTitle:      step?.title           ?? undefined,
          stepScripture:  step?.scripture       ?? undefined,
          stepTeaching:   step?.devotional ?? undefined,
          stepReflection: step?.reflectionQuestion ?? undefined,
          stepPrayer:     step?.prayerPrompt     ?? undefined,
        };
      })
    );

    // ── 6. Plain-text summary ────────────────────────────────────────────────
    const summaryParts: string[] = [];
    if (dailyRhythm) summaryParts.push(`${dailyRhythm.journeyTitle} (Day ${dailyRhythm.currentDay})`);
    activeDevotionals.forEach((d) => summaryParts.push(`${d.seriesTitle} Devotional (Day ${d.currentDay})`));
    if (sermonCompanion) summaryParts.push(`Sermon Companion: ${sermonCompanion.title}`);
    activeWalks.forEach((w) => summaryParts.push(`Walk: ${w.title} (Day ${w.currentDay} of ${w.totalDays || '?'})${w.stepTitle ? ` — "${w.stepTitle}"` : ''}`));

    res.set("Cache-Control", "no-store");
    res.json({
      dailyRhythm,
      activeDevotionals,
      activeWalks,
      sermonCompanion,
      todaysSummary: summaryParts.join(", ") || "No active content today.",
    });
  } catch (err) {
    logger.error({ err }, "[voice/context] failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /voice/conversation — canonical Emmaus transport ───────────────────
//
// Voice uses the same validated conversation service as text Ask Emmaus. The
// only Voice-specific responsibility here is building the server-authoritative
// context envelope and forwarding the canonical SSE stream.

/** Selects a verified card for an ordinal follow-up without inventing a route. */
export function selectSermonResult<T extends { openPath: string }>(
  results: T[],
  query: string,
): T | undefined {
  const ordinal = query.trim().match(/^(?:the\s+)?(first|second|third|1st|2nd|3rd)\b/i);
  if (!ordinal) return results[0];
  const index = { first: 0, second: 1, third: 2, "1st": 0, "2nd": 1, "3rd": 2 }[
    ordinal[1].toLowerCase()
  ];
  return index == null ? undefined : results[index];
}

router.post('/voice/conversation', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const body = req.body as VoiceConversationRequest;
  const message = typeof body.message === "string" ? body.message : "";
  const history = normalizeVoiceHistory(body.history);
  const rawContext =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? body.context
      : undefined;
  const isReading = body.isReading === true;
  const lastReadContext =
    typeof body.lastReadContext === "string"
      ? body.lastReadContext
          .replace(/https?:\/\/\S+|(?:^|\s)\/(?:api\/)?[^\s]+/gi, " ")
          .trim()
          .slice(0, 4000)
      : "";

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  if (!checkVoiceRateLimit(userId)) {
    res.status(429).json({ error: 'Too many voice requests. Please wait a moment.' });
    return;
  }

  const settings = getVoiceSettings();
  if (!settings.enabled) {
    res.status(503).json({ error: 'Voice mode is currently disabled.' });
    return;
  }

  /*
   * Voice is a transport adapter around the canonical Emmaus service. The
   * service owns persona, Scripture-first retrieval, sermon/resource
   * verification, safety, citations, and conversation persistence.
   *
   * The browser may provide a location hint and recent reading text, but it
   * cannot provide identity, routes, resource IDs, or an authoritative name.
   */
  const requestId = Math.random().toString(36).slice(2, 10);
  const contextRecord = rawContext ?? {};
  const canonicalContext = toEmmausContextInput(
    {
      ...contextRecord,
      userName: undefined,
      voiceAppContext: undefined,
    },
    userId,
  );
  canonicalContext.voiceContextEnvelope = buildVoiceContextEnvelope({
    requestId,
    userId,
    role: req.user?.role ?? "user",
    currentPath: body.currentPath,
    entryPoint: contextRecord.entryPoint,
    isReading,
    lastReadContext,
  });
  if (lastReadContext) {
    canonicalContext.voiceAppContext =
      "Verified reading follow-up text from the current Voice session:\n" + lastReadContext;
  }

  setSseHeaders(res);
  await handleConversation(
    {
      message: message.trim(),
      context: canonicalContext,
      history,
    },
    res,
  );
  return;
});

export default router;
