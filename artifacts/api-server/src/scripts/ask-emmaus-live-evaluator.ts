/**
 * Authenticated live Ask Emmaus release evaluator.
 *
 * This deliberately exercises the HTTP/SSE route rather than calling the
 * router, retrieval, or normalizer in isolation. It is test-fixture only:
 * test-auth refuses to run unless NODE_ENV=test and the explicit harness flag
 * are present.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { authHeader, cleanupTestAuth } from "../test-utils/test-auth.ts";
import { buildScriptureRoute } from "../emmaus/citation-validation.ts";

const BASE = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const fixtureId = `ask-emmaus-live-eval-${Date.now()}`;

type EvaluationCase = {
  id: string;
  prompt: string;
  expectedIntent: "ASK" | "FIND" | "READ" | "OPEN";
  expectedSignals: string[];
};

const cases: EvaluationCase[] = [
  { id: "devotional", prompt: "Help me find a devotional for today", expectedIntent: "FIND", expectedSignals: ["devotional"] },
  { id: "devotional-discovery", prompt: "What devotional resources could help me build a steady habit?", expectedIntent: "FIND", expectedSignals: ["devotional", "resource"] },
  { id: "todays-devotional", prompt: "Open today's devotional for me", expectedIntent: "OPEN", expectedSignals: ["devotional"] },
  { id: "faith", prompt: "How can I grow in faith when I feel uncertain?", expectedIntent: "ASK", expectedSignals: ["faith"] },
  { id: "prodigal", prompt: "What can the story of the Prodigal Son teach me about coming home?", expectedIntent: "ASK", expectedSignals: ["prodigal"] },
  { id: "fear", prompt: "I am afraid. How does God meet us in fear?", expectedIntent: "ASK", expectedSignals: ["fear"] },
  { id: "loneliness", prompt: "I feel lonely and far from people. What does Scripture say?", expectedIntent: "ASK", expectedSignals: ["lonely"] },
  { id: "forgiveness", prompt: "How do I begin forgiving someone who hurt me?", expectedIntent: "ASK", expectedSignals: ["forgiv"] },
  { id: "prodigal-sermon-search", prompt: "Find a sermon about the Prodigal Son", expectedIntent: "FIND", expectedSignals: ["sermon", "prodigal"] },
  { id: "faith-bible-study", prompt: "Show me a Bible Study about faith", expectedIntent: "FIND", expectedSignals: ["bible study", "faith"] },
  { id: "walk-continuation", prompt: "Continue my current Walk", expectedIntent: "ASK", expectedSignals: ["walk", "continue"] },
  { id: "journey-continuation", prompt: "Continue my current Journey", expectedIntent: "ASK", expectedSignals: ["journey", "continue"] },
  { id: "psalm-23", prompt: "Please open Psalm 23", expectedIntent: "OPEN", expectedSignals: ["psalm 23"] },
  { id: "john-3-16-18", prompt: "Read John 3:16–18", expectedIntent: "READ", expectedSignals: ["john 3:16"] },
  { id: "capability-discovery", prompt: "What can Emmaus help me with?", expectedIntent: "ASK", expectedSignals: ["emmaus"] },
  { id: "paraphrase-faith", prompt: "I want to become more trusting of God, where should I start?", expectedIntent: "ASK", expectedSignals: ["faith"] },
  { id: "paraphrase-john", prompt: "Take me to the passage about God loving the world", expectedIntent: "READ", expectedSignals: ["john 3:16"] },
];

type SseEvent = {
  type?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  message?: string;
  [key: string]: unknown;
};

async function runCase(testCase: EvaluationCase, headers: Record<string, string>) {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/emmaus/conversation`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      message: testCase.prompt,
      context: { entryPoint: "personal" },
    }),
  });
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstTextMs: number | null = null;
  const events: SseEvent[] = [];

  if (!reader) {
    return {
      ...testCase,
      status: response.status,
      provider: process.env.OPENAI_API_KEY ? "openai-configured" : "mock",
      firstTextMs: null,
      error: "response body was not readable",
      totalMs: Date.now() - started,
      streamEventCount: 0,
      text: "",
      displayAnswer: "",
      speakableAnswer: "",
      metadata: {},
      links: [],
      checks: { responseBodyReadable: false },
      passed: false,
    };
  }

  const parse = (line: string) => {
    if (!line.startsWith("data: ")) return;
    try {
      const event = JSON.parse(line.slice(6)) as SseEvent;
      events.push(event);
      if (event.type === "text" && firstTextMs == null) {
        firstTextMs = Date.now() - started;
      }
    } catch {
      events.push({ type: "parse_error", content: line.slice(6) });
    }
  };

  while (true) {
    const part = await reader.read();
    buffer += decoder.decode(part.value ?? new Uint8Array(), { stream: !part.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(parse);
    if (part.done) break;
  }
  if (buffer) parse(buffer);

  const done = events.find((event) => event.type === "done");
  const metadata = (done?.metadata ?? {}) as Record<string, unknown>;
  const displayAnswer = String(metadata.displayAnswer ?? metadata.answer ?? "");
  const speakableAnswer = String(metadata.speakableAnswer ?? "");
  const scriptureReferences = Array.isArray(metadata.scriptureReferences)
    ? metadata.scriptureReferences as Array<Record<string, unknown>>
    : [];
  const recommendations = Array.isArray(metadata.recommendations)
    ? metadata.recommendations as Array<Record<string, unknown>>
    : [];
  const text = events
    .filter((event) => event.type === "text")
    .map((event) => String(event.content ?? ""))
    .join("");
  const links = [
    ...scriptureReferences.map((ref) => buildScriptureRoute({
      book: String(ref.book ?? ""),
      chapter: Number(ref.chapter),
      verseStart: ref.verseStart == null ? undefined : Number(ref.verseStart),
      verseEnd: ref.verseEnd == null ? undefined : Number(ref.verseEnd),
    })),
    ...recommendations.map((item) => typeof item.path === "string" ? item.path : null),
  ].filter((path): path is string => Boolean(path));
  const pipelineTimings = (metadata.pipelineTimings ?? {}) as Record<string, unknown>;
  const modelWasUsed = typeof pipelineTimings.modelTtftMs === "number";
  const comparableStream = text.replace(/\s+/g, " ").replace(/\.{3}/g, "").trim();
  const comparableDisplay = displayAnswer.replace(/\s+/g, " ").replace(/\.{3}/g, "").trim();
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < comparableStream.length
    && commonPrefixLength < comparableDisplay.length
    && comparableStream[commonPrefixLength] === comparableDisplay[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }
  const streamReconciles = comparableStream === comparableDisplay
    || comparableStream.startsWith(comparableDisplay)
    || comparableDisplay.startsWith(comparableStream)
    || (
      Math.min(comparableStream.length, comparableDisplay.length) >= 200
      && commonPrefixLength / Math.min(comparableStream.length, comparableDisplay.length) >= 0.75
    );
  const lower = `${displayAnswer} ${JSON.stringify(metadata)}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  const checks = {
    done: Boolean(done),
    expectedIntent: metadata.requestedIntent === testCase.expectedIntent,
    signalCoverage: testCase.expectedSignals.every((signal) => lower.includes(signal)),
    displayAnswerPresent: displayAnswer.length > 0,
    displayAnswerConcise: displayAnswer.length <= 2400,
    speakableAnswerPresent: speakableAnswer.length > 0,
    speakableAnswerConcise: speakableAnswer.length <= 720,
    noUrlsInDisplay: !/https?:\/\/|\/(?:api\/)?(?:sermon|journey|devotional|bible)\//i.test(displayAnswer),
    citationsHaveCanonicalRoutes: scriptureReferences.every((ref) => {
      const route = buildScriptureRoute({
        book: String(ref.book ?? ""),
        chapter: Number(ref.chapter),
        verseStart: ref.verseStart == null ? undefined : Number(ref.verseStart),
        verseEnd: ref.verseEnd == null ? undefined : Number(ref.verseEnd),
      });
      return Boolean(route);
    }),
    streamedTextReconcilesOnDone: streamReconciles,
    typedModelStreamsIncrementally: !modelWasUsed || (
      (pipelineTimings.firstValidatedVisibleMs != null) && events.filter((event) => event.type === "text").length >= 2
    ),
    noControlTagsInStream: !/<EMMAUS_META|<\/EMMAUS_META/i.test(text),
    dedupedRecommendations: new Set(recommendations.map((item) =>
      `${item.type}:${item.resourceId ?? item.path ?? item.title}`,
    )).size === recommendations.length,
  };

  return {
    ...testCase,
    status: response.status,
    provider: process.env.OPENAI_API_KEY ? "openai-configured" : "mock",
    firstTextMs,
    totalMs: Date.now() - started,
    streamEventCount: events.filter((event) => event.type === "text").length,
    text,
    displayAnswer,
    speakableAnswer,
    metadata,
    links,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

async function main() {
  const headers = await authHeader(fixtureId, { role: "user" });
  const results = [];
  try {
    for (const testCase of cases) {
      const result = await runCase(testCase, headers);
      results.push(result);
      console.log(JSON.stringify({
        id: testCase.id,
        passed: result.passed,
        firstTextMs: result.firstTextMs,
        totalMs: result.totalMs,
      }));
    }
  } finally {
    await cleanupTestAuth();
  }

  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    provider: process.env.OPENAI_API_KEY ? "openai-configured" : "mock",
    caseCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    results,
  };
  await mkdir("test-artifacts", { recursive: true });
  await writeFile(
    "test-artifacts/ask-emmaus-live-evaluation.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(JSON.stringify({
    suite: "ask-emmaus-live-evaluation",
    provider: output.provider,
    cases: output.caseCount,
    passed: output.passedCount,
    artifact: "test-artifacts/ask-emmaus-live-evaluation.json",
  }));
  if (output.provider !== "openai-configured" || output.passedCount !== output.caseCount) {
    process.exitCode = 1;
  }
}

await main();