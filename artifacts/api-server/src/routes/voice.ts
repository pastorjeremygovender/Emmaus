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

import OpenAI from "openai";
import { Router, type Request, type Response } from "express";
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
import { searchSermons } from "../lib/sermon-search.js";

const router = Router();

const VOICE_BIBLE_BOOKS = new Set([
  "genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth",
  "1samuel","2samuel","1kings","2kings","1chronicles","2chronicles","ezra","nehemiah",
  "esther","job","psalms","proverbs","ecclesiastes","songofsolomon","isaiah","jeremiah",
  "lamentations","ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah",
  "nahum","habakkuk","zephaniah","haggai","zechariah","malachi","matthew","mark","luke",
  "john","acts","romans","1corinthians","2corinthians","galatians","ephesians",
  "philippians","colossians","1thessalonians","2thessalonians","1timothy","2timothy",
  "titus","philemon","hebrews","james","1peter","2peter","1john","2john","3john","jude","revelation",
]);

function validateVoiceToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> | null {
  if (name === "read_content") {
    const type = args.type;
    if (!["bible", "daily-rhythm", "devotional", "sermon-companion", "walk"].includes(String(type))) return null;
    if (type === "bible") {
      const book = typeof args.bibleBook === "string" ? args.bibleBook.toLowerCase().replace(/[\s_-]+/g, "") : "";
      const chapter = Number(args.bibleChapter);
      if (!VOICE_BIBLE_BOOKS.has(book) || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) return null;
      return { type, bibleBook: book, bibleChapter: chapter };
    }
    return { type, ...(typeof args.titleHint === "string" ? { titleHint: args.titleHint.trim().slice(0, 80) } : {}) };
  }
  if (name === "navigate") {
    const destination = args.destination;
    if (!["walk", "bible", "discover", "journeys", "back"].includes(String(destination))) return null;
    return { destination, ...(typeof args.bibleBookId === "string" ? { bibleBookId: args.bibleBookId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) } : {}), ...(Number.isInteger(args.bibleChapter) ? { bibleChapter: args.bibleChapter } : {}) };
  }
  return args;
}

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

// ─── POST /voice/conversation — LLM tool dispatch ────────────────────────────
//
// Voice-specific LLM endpoint with function/tool calling.
// The model receives 2 tools (read_content, navigate) and decides whether to
// call one, or respond with plain text (Ask Emmaus conversation).
//
// SSE event types emitted:
//   { type: 'text',      content: string }      — streamed text chunks
//   { type: 'tool_call', tool: string, args: object } — tool the model chose
//   { type: 'done',      text: string }          — stream complete
//   { type: 'error',     message: string }        — failure

const VOICE_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_content',
      description:
        "Read the user's active discipleship content aloud. Use whenever the user asks to read, start, open, do, or continue any content — their devotional, Daily Rhythm (also called '10 Minutes with Jesus'), Sermon Companion, or a specific Bible passage.",
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['daily-rhythm', 'devotional', 'walk', 'sermon-companion', 'bible'],
            description:
              "'daily-rhythm' — the 10 Minutes with Jesus / Daily Rhythm content. 'devotional' — a devotional series (e.g. Psalms Daily Devotional). 'walk' — an active Walk (Quick Study) the user is working through. 'sermon-companion' — the weekly Sermon Companion. 'bible' — a specific Bible passage.",
          },
          bibleBook: {
            type: 'string',
            description: "For type='bible': the book name in lowercase with NO spaces or hyphens (e.g. 'john', 'psalms', 'romans', '1corinthians', '2timothy', '1peter', 'songofsolomon'). Strip all spaces and hyphens — never include them.",
          },
          bibleChapter: {
            type: 'number',
            description: "For type='bible': the chapter number.",
          },
          titleHint: {
            type: 'string',
            description:
              "For type='devotional': a keyword from the series title to select the right one (e.g. 'psalms' for 'Psalms Daily Devotional'). Omit when there is only one active devotional.",
          },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description:
        "Navigate the user to a section of the Emmaus app, or to a specific Bible chapter. Do NOT use this for walk/journey continuation — use continue_walk instead. Do NOT use this to read a Bible passage aloud — use read_content with type 'bible' instead. Use this only when the user says 'go to', 'open', 'take me to', or 'show me' a destination without asking it to be read.",
      parameters: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            enum: ['walk', 'bible', 'discover', 'journeys', 'back'],
            description:
              "'walk' = Today's Steps (home). 'bible' = My Bible (chapter list). 'discover' = Discover feed. 'journeys' = Walks & Journeys list. 'back' = previous screen. Use 'bible' when navigating to a specific chapter too.",
          },
          bibleBookId: {
            type: 'string',
            description:
              "When navigating to a specific Bible chapter: the book id in lowercase (e.g. 'john', 'psalms', 'romans'). Omit for general Bible navigation.",
          },
          bibleChapter: {
            type: 'number',
            description:
              "When navigating to a specific Bible chapter: the chapter number (e.g. 3 for John 3). Must be paired with bibleBookId.",
          },
        },
        required: ['destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'continue_walk',
      description:
        "Take the user directly to their current step in an active walk or journey. Use when they say 'continue my walk', 'where was I', 'open my journey', 'keep going', 'resume', 'pick up where I left off', 'open my daily rhythm', or any phrase that means 'take me to where I left off'. Never use 'navigate' for this — always prefer this tool. The server resolves which walk and which step automatically. If no hint is given and the user has one active walk, the server uses it. If they name a walk (e.g. 'my Psalms journey'), pass the name as titleHint.",
      parameters: {
        type: 'object',
        properties: {
          titleHint: {
            type: 'string',
            description: 'Optional keyword from the walk title to select among multiple active walks (e.g. "psalms", "john", "daily rhythm"). Only provide after a clarification prompt.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_sermons',
      description:
        "Search for sermons the pastor has preached. Use whenever the user asks 'did Pastor preach about X?', 'find a sermon about Y', 'can you show me where Pastor talked about this?', 'I remember a sermon about Z', or any request to discover specific preached content. The server searches the sermon archive and returns a spoken summary of the top results.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: "The search topic or phrase, e.g. 'faith', 'prayer', 'the cross', 'Gideon'",
          },
        },
        required: ['query'],
      },
    },
  },
];

// ─── search_sermons server-side resolver ─────────────────────────────────────
/**
 * Search the sermon archive and return a TTS-ready spoken summary plus a
 * client-side navigation route (e.g. /discover?q=faith).
 */
async function resolveSearchSermons(
  query: string,
  history: Array<{ role: string; content: string }> = [],
): Promise<{
  spokenText: string;
  sermonResults: Array<{
    sermonId: string; title: string; speaker: string; sermonDate: string;
    excerpt: string; reason: string; openPath: string; watchUrl: string;
    watchTimestampSeconds?: number; listenAvailable: boolean; listenPath?: string;
  }>;
  selectedSermonPath?: string;
}> {
  try {
    const ordinal = query.trim().match(/^(?:the\s+)?(first|second|third|1st|2nd|3rd)\b/i);
    const previousSearch = [...history].reverse().find((item) =>
      item.role === "user" && /\b(?:sermon|preach|preached|pastor|teaching)\b/i.test(item.content)
    );
    const effectiveQuery = ordinal && previousSearch ? previousSearch.content : query.trim();
    const rawResults = await searchSermons(effectiveQuery, { maxResults: 5 });
    const published = await import("../lib/canonical-sermon-store.js").then((m) => m.listPublishedSermons()).catch(() => []);
    const byYoutube = new Map(published.map((sermon) => [sermon.youtubeVideoId, sermon]));
    const results = rawResults
      .map((result) => ({ result, sermon: byYoutube.get(result.youtubeUrl.match(/[?&]v=([^&]+)/)?.[1] ?? "") }))
      .filter((item): item is { result: typeof rawResults[number]; sermon: typeof published[number] } => Boolean(item.sermon))
      .slice(0, 3);
    const sermonResults = results.map(({ result, sermon }) => ({
      sermonId: sermon.id,
      title: sermon.title,
      speaker: sermon.speaker,
      sermonDate: sermon.sermonDate,
      excerpt: (sermon.summary || result.transcriptEvidence || sermon.mainTheme).slice(0, 300),
      reason: `Matches your search for “${effectiveQuery.slice(0, 80)}”.`,
      openPath: `/sermon/${sermon.id}`,
      watchUrl: result.timestampedUrl,
      ...(result.absoluteStartSeconds != null ? { watchTimestampSeconds: result.absoluteStartSeconds } : {}),
      listenAvailable: Boolean(result.audioUrl || sermon.audioPath),
      ...(result.audioUrl || sermon.audioPath ? { listenPath: `/sermon/${sermon.id}` } : {}),
    }));

    if (sermonResults.length === 0) {
      return {
        spokenText: `I couldn't find a published sermon specifically about "${query.trim()}".`,
        sermonResults: [],
      };
    }

    const selected = selectSermonResult(sermonResults, query);
    const dateStr = selected?.sermonDate
      ? ` from ${new Date(selected.sermonDate).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`
      : '';
    return {
      spokenText: ordinal && selected
        ? `Opening "${selected.title}"${dateStr}.`
        : sermonResults.length === 1
          ? `I found "${selected.title}"${dateStr}.`
          : `I found ${sermonResults.length} published sermons. The closest is "${selected.title}"${dateStr}.`,
      sermonResults,
      ...(ordinal && selected ? { selectedSermonPath: selected.openPath } : {}),
    };
  } catch {
    return {
      spokenText: `I couldn't verify any published sermons for "${query.trim()}".`,
      sermonResults: [],
    };
  }
}

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

// ─── continue_walk server-side resolver ──────────────────────────────────────
/**
 * Looks up the user's active walks and returns either:
 *   { route: '/journey/{id}/day/{day}' }  — single active walk, navigate directly
 *   { prompt: '...' }                      — zero or multiple walks, speak clarification
 */
async function resolveContinueWalk(
  userId: string,
  titleHint?: string,
): Promise<{ route?: string; prompt?: string; journeyTitle?: string; currentDay?: number }> {
  const [allJourneys, allProgress] = await Promise.all([
    listPublishedJourneys().catch((): FrontendJourney[] => []),
    getAllProgress(userId).catch((): Record<string, FrontendProgress> => ({})),
  ]);

  // Step 1: keep only journeys with status === 'active'.
  // 'paused', 'completed', and 'dropped' are not continuable.
  const activeJourneys = allJourneys.filter((j) => {
    const prog = allProgress[j.id];
    return prog?.status === 'active';
  });

  if (activeJourneys.length === 0) {
    return {
      prompt: "I don't see any active walks right now. Head to Today's Steps to get started.",
    };
  }

  // Step 2: verify that currentDay has a real Published step.
  // completeStep() advances currentDay to day + 1 without changing status.
  // On a finished walk this means currentDay now points past the last step —
  // routing there would 404/redirect-away, so we exclude those journeys.
  const continuable = (
    await Promise.all(
      activeJourneys.map(async (j) => {
        const prog     = allProgress[j.id]!;
        const day      = prog.currentDay ?? 1;
        const steps    = await listSteps(j.id).catch((): FrontendStep[] => []);
        const hasStep  = steps.some((s) => s.day === day && s.status === 'Published');
        return hasStep ? { journeyId: j.id, title: j.title, currentDay: day } : null;
      }),
    )
  ).filter((w): w is { journeyId: string; title: string; currentDay: number } => w !== null);

  if (continuable.length === 0) {
    return {
      prompt: "I don't see any active walks with a step ready right now. Head to Today's Steps to see what's available.",
    };
  }

  // Step 3: if the user named a walk (after a clarification prompt), fuzzy-match by hint.
  let candidates = continuable;
  if (titleHint && titleHint.trim()) {
    const hint    = titleHint.trim().toLowerCase();
    const matched = continuable.filter((w) => w.title.toLowerCase().includes(hint));
    if (matched.length > 0) candidates = matched;
  }

  if (candidates.length === 1) {
    const walk = candidates[0];
    return {
      route:        `/journey/${walk.journeyId}/day/${walk.currentDay}`,
      journeyTitle: walk.title,
      currentDay:   walk.currentDay,
    };
  }

  // Multiple walks remain (either no hint or hint was ambiguous) — ask the user to clarify
  const titles = continuable.map((w) => w.title).join(' and ');
  return {
    prompt: `You have ${continuable.length} active walks: ${titles}. Which one would you like to continue?`,
  };
}

function buildVoiceSystemPrompt(voiceAppContext?: string, isReading?: boolean, lastReadContext?: string): string {
  const lines = [
    'You are Emmaus — a confident, warm, and direct voice companion for Christian discipleship.',
    'This is a voice conversation. You are the primary way the user interacts with the app.',
    '',
    'VOICE STYLE (non-negotiable):',
    '- Speak in 1–2 natural sentences. Three only when genuinely needed — never more.',
    '- No markdown, bullet points, lists, or headers. Ever.',
    '- Sound like a trusted, knowledgeable friend who knows this person well — direct and unhurried.',
    '- Never open with filler: no "Sure!", "Of course!", "Absolutely!", "Great question!", "Certainly!".',
    '- When acknowledging an interruption or pivot, be brief: "Got it." or "Okay." — then act.',
    '- When the user says "yes", "sure", "go ahead", "do it", "continue", or any clear affirmation — if the next action is obvious from context, do it immediately. Never re-confirm.',
    '',
    'TOOLS — act immediately, never announce:',
    '- Call the right tool the moment it applies. No preamble, no "I will now…", no announcement.',
    '- read_content → say NOTHING. The content playing IS your response.',
    '- navigate → one brief orienting line at most: "Opening John 3." / "Opening your Bible."',
    '- search_sermons → call it; never guess from memory.',
    '- Never say you cannot do something a tool handles. Just use the tool.',
    '',
    'BIBLE — READ vs NAVIGATE (critical distinction):',
    '- "Read John 3", "read me Psalms 23", "read the passage" → read_content, type "bible", bibleBook+bibleChapter.',
    '- "Go to John 3", "open John 3", "take me to Psalms 23", "show me Romans 8" → navigate, destination "bible", bibleBookId+bibleChapter.',
    '- The difference: read_content plays the text aloud. navigate opens the chapter on screen silently.',
    '- Always use the book id in lowercase with NO spaces or hyphens: "john", "psalms", "romans", "1corinthians", "2corinthians", "1timothy", "2timothy", "1peter", "2peter", "1john", "songofsolomon". Strip spaces — never "1 corinthians".',
    '',
    'READING REQUESTS — resolve immediately:',
    '- "Read", "read to me", "get me started", "start my reading", "my reading", "let\'s go", "start" → read_content. Use "daily-rhythm" if available; otherwise "walk" if active; otherwise "devotional".',
    '- "My devotional", "open devotional", "today\'s devotional" → read_content, type "devotional".',
    '- "My walk", "read my walk", "today\'s walk", "read my step" → read_content, type "walk".',
    '- "Sermon companion", "companion", "Sunday companion" → read_content, type "sermon-companion".',
    '- "What do I have?", "what\'s on today?", "what can I read?" → ONE sentence naming available content, then "Which would you like?" — do NOT call a tool yet.',
    '- "Yes", "go ahead", "start it", "do it" after you named content → call read_content immediately.',
    '',
    'CONTENT ALIASES — what users say → what you call:',
    '  "daily rhythm" | "10 minutes with jesus" | "10 minutes" | "my daily reading" | "morning reading" → type: "daily-rhythm"',
    '  "[series] devotional" | "my devotional" | "my psalms" | "psalms" → type: "devotional"',
    '  "my walk" | "read my walk" | "today\'s walk" | "my step" | "the walk" → type: "walk"',
    '  "sermon companion" | "companion" | "sunday companion" → type: "sermon-companion"',
    '',
    'SERMON SEARCH:',
    '- Call search_sermons when the user asks about a topic or sermon by Pastor.',
    '- Triggers: "did Pastor preach about X?", "find a sermon on faith", "what has Pastor said about grace?"',
    '- Never answer from memory — always call search_sermons.',
    '',
    'AFTER READING ENDS:',
    '- Offer ONE brief, natural follow-up: "Anything from that you want to explore?" or "Want me to continue?"',
    '- Never summarise what was just read unless explicitly asked.',
    '',
    'FAITH CONVERSATIONS:',
    '- Answer spiritual questions like a knowledgeable pastor friend — warm, grounded, never preachy or academic.',
    '- Keep it brief. If the topic deserves depth, give the core insight and offer to go further.',
  ];

  if (voiceAppContext) {
    lines.push('', "User's available content today (resolve all vague reading requests against this):", voiceAppContext);
    lines.push('', 'Priority for vague requests ("get me started", "read something", "my reading"):');
    lines.push('  1. daily-rhythm if listed above, otherwise');
    lines.push('  2. walk (type: "walk") if listed above, otherwise');
    lines.push('  3. devotional if listed above.');
    lines.push('Only ask for clarification when there is genuine ambiguity (e.g. two active walks and the user hasn\'t named one).');
  } else {
    lines.push('', 'No active content found today. Respond conversationally and invite them to tell you what they need.');
  }

  if (isReading) {
    lines.push('', 'Content is being read aloud now. The user may ask questions mid-reading, say "pause", "stop", "explain", or "continue". Respond briefly and naturally.');
  }

  if (lastReadContext) {
    lines.push(
      '',
      'This content was just read aloud — the session has ended. Answer follow-up questions using it:',
      lastReadContext,
    );
  }

  return lines.join('\n');
}

router.post('/voice/conversation', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { message, history, voiceAppContext, isReading, lastReadContext } = req.body as {
    message?:         string;
    history?:         Array<{ role: string; content: string }>;
    voiceAppContext?:  string;
    isReading?:        boolean;
    lastReadContext?:  string;
  };

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Voice AI not configured.' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sse(event: object) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  try {
    // Use a dedicated fast model for voice — never gpt-5 (90–150s latency).
    // VOICE_CONV_MODEL allows override; falls back to gpt-4o for speed + tool quality.
    const model = process.env.VOICE_CONV_MODEL ?? 'gpt-4o';
    const openai = new OpenAI({ apiKey });

    const systemPrompt = buildVoiceSystemPrompt(voiceAppContext, isReading, lastReadContext);

    const safeHistory = (history ?? [])
      .slice(-6)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: message },
    ];

    const stream = await openai.chat.completions.create({
      model,
      messages,
      tools:        VOICE_TOOLS,
      tool_choice:  'auto',
      stream:       true,
      max_completion_tokens: 300, // voice responses are short
    });

    let fullText = '';
    let sentenceBuf = '';
    const toolCalls: Record<number, { id: string; name: string; argsStr: string }> = {};

    // Sentence boundary: punctuation mark followed by optional closing quote/paren
    // then one-or-more whitespace characters.  Keeps trailing whitespace consumed
    // so the next sentence starts clean.
    const SENTENCE_END = /[.?!][)\]"'`]*\s+/;

    /** Extract and emit all complete sentences from sentenceBuf. */
    function flushSentences() {
      while (true) {
        const m = SENTENCE_END.exec(sentenceBuf);
        if (!m) break;
        const boundary = m.index + m[0].length;
        const sentence = sentenceBuf.slice(0, boundary).trim();
        sentenceBuf    = sentenceBuf.slice(boundary);
        if (sentence) sse({ type: 'sentence', content: sentence });
      }
    }

    for await (const chunk of stream) {
      const delta        = chunk.choices[0]?.delta;
      const finishReason = chunk.choices[0]?.finish_reason;

      // Stream text chunks (kept for display / streaming indicator on the client)
      if (delta?.content) {
        fullText    += delta.content;
        sentenceBuf += delta.content;
        sse({ type: 'text', content: delta.content });

        // Only flush sentences for conversational responses — tool calls do not
        // produce delta.content so toolCalls will be empty at this point when
        // the model is generating a plain reply.
        if (Object.keys(toolCalls).length === 0) {
          flushSentences();
        }
      }

      // Accumulate tool call fragments (arguments arrive piecemeal)
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', argsStr: '' };
          if (tc.id)                  toolCalls[idx].id = tc.id;
          if (tc.function?.name)      toolCalls[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].argsStr += tc.function.arguments;
        }
      }

      // Emit tool_call events when the model finishes choosing
      if (finishReason === 'tool_calls' || finishReason === 'stop') {
        // Flush any trailing sentence fragment (e.g. a response ending without
        // trailing whitespace such as "That's great!" with no space after).
        //
        // ORDERING INVARIANT: this { type:'sentence' } event is emitted HERE,
        // inside the for-await loop, BEFORE the { type:'done' } event that
        // follows the loop.  The client SSE reader processes events in stream
        // order, so onSentence always fires before onDone for any non-empty
        // conversational response.  This guarantees that sentenceEverEnqueued
        // is true on the client before the drain / fallback check runs.
        // Do NOT move this flush below the loop or after the done event.
        if (finishReason === 'stop' && sentenceBuf.trim()) {
          sse({ type: 'sentence', content: sentenceBuf.trim() });
          sentenceBuf = '';
        }
        for (const tc of Object.values(toolCalls)) {
          if (!tc.name) continue;
          let args: object = {};
          try { args = JSON.parse(tc.argsStr || '{}'); } catch { /* malformed args — use empty */ }
          const validatedArgs = validateVoiceToolArgs(tc.name, args as Record<string, unknown>);
          if (!validatedArgs) {
            sse({ type: 'tool_call', tool: 'action_rejected', args: { code: 'VOICE_INVALID_TOOL_ARGS', message: 'I could not safely verify that Voice action.' } });
            continue;
          }
          args = validatedArgs;
          if (tc.name === 'continue_walk') {
            const { titleHint } = args as { titleHint?: string };
            const resolvedArgs = await resolveContinueWalk(userId, titleHint);
            sse({ type: 'tool_call', tool: tc.name, args: resolvedArgs });
          } else if (tc.name === 'search_sermons') {
            const { query } = args as { query?: string };
            const resolvedArgs = await resolveSearchSermons(query ?? '', Array.isArray(req.body?.history) ? req.body.history : []);
            sse({ type: 'tool_call', tool: tc.name, args: resolvedArgs });
          } else if (tc.name === 'navigate') {
            const navArgs = args as { destination: string; bibleBookId?: string; bibleChapter?: number };
            if (navArgs.bibleBookId && navArgs.bibleChapter) {
              // Deep-link to a specific Bible chapter — resolve the route server-side.
              // The chapter reader is mounted at /bible/read/:bookId/:chapter in App.tsx.
              const resolvedRoute = `/bible/read/${navArgs.bibleBookId}/${navArgs.bibleChapter}`;
              sse({ type: 'tool_call', tool: tc.name, args: { ...navArgs, resolvedRoute } });
            } else {
              sse({ type: 'tool_call', tool: tc.name, args });
            }
          } else {
            sse({ type: 'tool_call', tool: tc.name, args });
          }
        }
      }
    }

    sse({ type: 'done', text: fullText });
    res.end();

    logger.info({ userId, model, chars: fullText.length, tools: Object.keys(toolCalls).length }, 'voice: conversation ok');
  } catch (err) {
    logger.warn({ err, userId }, 'voice: conversation error');
    if (!res.headersSent) {
      sse({ type: 'error', message: 'Something went wrong. Please try again.' });
    }
    res.end();
  }
});

export default router;
