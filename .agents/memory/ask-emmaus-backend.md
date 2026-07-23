---
name: Ask Emmaus backend
description: Conversation service architecture, streaming, model routing, and sermon retrieval.
---

## Conversation service

POST `/api/emmaus/conversation` — starts or continues; streams SSE.
POST `/api/emmaus/conversation/:id/message` — appends to existing; streams SSE.

Route: `artifacts/api-server/src/emmaus/`

Key files:
- `conversation-service.ts` — route classification (fast/deep), token caps, EMMAUS_META parsing, sermon injection
- `llm-provider.ts` — OpenAI streaming provider; `StreamOptions` carries `maxTokens`, `reasoningEffort`, `model`
- `sermon-retrieval.ts` — verified sermon registry; keyword + scripture scoring; `retrieveSermon()`
- `system-instructions.ts` — single source of truth for system prompt; `PROMPT_VERSION="1.0.0"`
- `context-builder.ts` — assembles LLM message array from context input
- `firestore-model.ts` — `Recommendation` includes `label?`, `speakerName?`

## Streaming — critical

`OpenAIProvider.streamCompletion` MUST use a typed `ChatCompletionCreateParamsStreaming` object (not `Record<string, any>`). The `as any` cast breaks the SDK's overload resolution and silently returns a non-streaming response, causing `chars=0` and no TTFT. Use:

```typescript
const streamParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
  model: opts.model ?? this.model,
  messages,
  stream: true,
  max_completion_tokens: maxTokens,
};
```

`reasoning_effort` is spread via `(streamParams as unknown as Record<string, unknown>).reasoning_effort` only for o1/o3/o4 models (detected by `isReasoningModel()` regex).

**Why:** gpt-5 with `stream: true` in a `Record<string, any>` cast silently returns a non-iterable result. The `for await` loop runs but `choices[0]?.delta?.content` is always `""`. TTFT never fires. Total time still ~7-30s but zero content emitted.

## Model routing

Two env vars control per-route model selection:
- `EMMAUS_FAST_MODEL=gpt-4o` — fast-path questions (greetings, encouragement, Bible questions)
- `EMMAUS_DEEP_MODEL=gpt-5` — deep-path questions (theological complexity, etc.)

`routeSettings(route)` returns `{ maxTokens, historyTurns, reasoningEffort, model? }`.
Model override is passed as `opts.model` to `streamCompletion`.

**Why:** gpt-5 TTFT is ~30s baseline. gpt-4o TTFT is 370–700ms. Fast path MUST use a low-latency model.

## Token caps

- Fast path: `EMMAUS_MAX_OUTPUT_TOKENS` (default 900)
- Deep path: `EMMAUS_DEEP_MAX_TOKENS` (default 1400)
- History turns: fast=6, deep=10

## Sermon retrieval

`retrieveSermon(query, bibleBookId?, bibleChapter?)` — deterministic, never touches LLM.

Scoring per verified sermon:
- Bible book+chapter match: +12/+8 (strong)
- Topic match: +4 each
- Priority keyword match: +5 each (unique phrases like "born again", "nicodemus")
- Standard keyword match: +3 each
- Book name in query: +2 each

Threshold: `EMMAUS_SERMON_MIN_SCORE` (default 5). A single priority keyword hit clears threshold.

LLM-generated `type:"sermon"` recommendations are stripped after EMMAUS_META parse and replaced with the verified retrieval result. LLM is instructed not to fabricate sermon recs in system prompt.

## Flat context shape

Routes accept flat context (not nested). `toContextInput()` in `routes/emmaus.ts` maps:
- `bookId`, `bookName`, `chapter`, `chapterHeading` → `bibleContext`
- `journeyId`, `journeyTitle`, `currentDay` → `journeyContext`
- `sermonId`, `sermonTitle`, `scriptureReference` → `sermonContext`

Curl tests must use flat context: `{"context":{"entryPoint":"bible","bookId":"john","chapter":3}}`.

## Known limitations

- Both verified sermons have `PLACEHOLDER_VIDEO_ID` in their YouTube URLs. "Watch sermon" links open YouTube but won't resolve until real IDs are entered in admin.
- Transcript segment timestamps are not yet stored; `timestampSeconds` is always `undefined`.

## Performance results (post-optimization)

Baseline (gpt-5 fast path): TTFT=30,249ms, Total=42,126ms
After (gpt-4o fast path, 900 token cap): TTFT=370–691ms, Total=1.3–12.9s
5-turn conversation: every response begins within 600ms.
