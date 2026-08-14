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
  type VoiceId,
} from "../lib/voice-service.js";
import {
  listPublishedJourneys,
  getAllProgress,
  listSteps,
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
      const steps = await listSteps(drJourney.id).catch((): FrontendStep[] => []);
      const published = entries.filter((e) => e.status === "Published");
      const prog = allProgress[drJourney.id];
      const maxDay = entries.reduce((m, e) => Math.max(m, e.dayNumber), 0);
      const currentDay = progress?.currentDay ?? 1;
      const step = published.find((s) => s.day === currentDay);
      if (step) {
        dailyRhythm = {
          journeyId:    drJourney.id,
          journeyTitle: drJourney.title,
          currentDay,
          totalDays:    maxDay,
          stepTitle:    step.title ?? "",
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
      const currentDay = progress?.currentDay ?? 1;
      const entry = published.find((e) => e.dayNumber === currentDay);
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
    const activeWalks = allJourneys
      .filter((j) => j.journeyType !== "daily-rhythm")
      .filter((j) => {
        const prog = allProgress[j.id];
        return prog !== undefined && prog.status !== "paused";
      })
      .map((j) => ({
        journeyId:  j.id,
        title:      j.title,
        slug:       j.id,
        currentDay: allProgress[j.id]?.currentDay ?? 1,
      }));

    // ── 6. Plain-text summary ────────────────────────────────────────────────
    const summaryParts: string[] = [];
    if (dailyRhythm) summaryParts.push(`${dailyRhythm.journeyTitle} (Day ${dailyRhythm.currentDay})`);
    activeDevotionals.forEach((d) => summaryParts.push(`${d.seriesTitle} Devotional`));
    if (sermonCompanion) summaryParts.push(`Sermon Companion: ${sermonCompanion.title}`);
    activeWalks.forEach((w) => summaryParts.push(`Walk: ${w.title} (Day ${w.currentDay})`));

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
            enum: ['daily-rhythm', 'devotional', 'sermon-companion', 'bible'],
            description:
              "'daily-rhythm' — the 10 Minutes with Jesus / Daily Rhythm content. 'devotional' — a devotional series (e.g. Psalms Daily Devotional). 'sermon-companion' — the weekly Sermon Companion. 'bible' — a specific Bible passage.",
          },
          bibleBook: {
            type: 'string',
            description: "For type='bible': the book name in lowercase (e.g. 'john', 'psalms', 'romans').",
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
      description: 'Navigate the user to a general section of the Emmaus app. Do NOT use this for walk/journey continuation — use continue_walk instead.',
      parameters: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            enum: ['walk', 'bible', 'discover', 'journeys', 'back'],
            description:
              "'walk' = Today's Steps (home). 'bible' = My Bible. 'discover' = Discover feed. 'journeys' = Walks & Journeys list. 'back' = previous screen.",
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
];

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

function buildVoiceSystemPrompt(voiceAppContext?: string, isReading?: boolean): string {
  const lines = [
    'You are Emmaus, a voice companion for a Christian discipleship app.',
    'This is voice — speak in short plain sentences. No markdown, no bullet points, no headers.',
    'Keep responses to 2–3 sentences unless the user asks for more detail.',
    'When a tool is appropriate, call it. Do not explain what you are about to do — just do it.',
    'If you call read_content, say nothing additional — the reading itself is the response.',
    'If you call navigate, you may say one brief sentence (e.g. "Opening your Bible now.").',
    'When the user asks a faith question or wants to talk, respond conversationally — no tool needed.',
    "Never say you cannot do something that a tool can do. Never say 'I cannot read' or 'I cannot navigate'.",
  ];

  if (voiceAppContext) {
    lines.push('', "User's active Emmaus content:", voiceAppContext);
  }

  if (isReading) {
    lines.push('', 'Content is currently being read aloud. The user may ask about what they just heard.');
  }

  return lines.join('\n');
}

router.post('/voice/conversation', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { message, history, voiceAppContext, isReading } = req.body as {
    message?:        string;
    history?:        Array<{ role: string; content: string }>;
    voiceAppContext?: string;
    isReading?:      boolean;
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

    const systemPrompt = buildVoiceSystemPrompt(voiceAppContext, isReading);

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
          if (tc.name === 'continue_walk') {
            const { titleHint } = args as { titleHint?: string };
            const resolvedArgs = await resolveContinueWalk(userId, titleHint);
            sse({ type: 'tool_call', tool: tc.name, args: resolvedArgs });
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
