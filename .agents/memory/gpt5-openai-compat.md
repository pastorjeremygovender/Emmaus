---
name: gpt-5 OpenAI API compatibility
description: Parameters gpt-5 rejects that work on gpt-4o and o-series; how to detect and handle it.
---

## Rule
When `OPENAI_MODEL` is `gpt-5`, the OpenAI API rejects:
- `temperature` (must not be set at all; even `temperature: 1` causes an error — just omit it)
- `max_tokens` (use `max_completion_tokens` instead)

It also needs **much higher** `max_completion_tokens` than standard models because it apparently uses chain-of-thought reasoning tokens internally before generating output, similar to o-series models. Setting `max_completion_tokens: 4000` truncates mid-JSON for a chapter-batch response; needs at least `6000` for passages and `5000` for book intros.

**Why:** gpt-5 (July 2026) behaves like a hybrid reasoning model — it silently uses reasoning tokens and is slow per call (~90–150 seconds for a structured JSON generation task).

**How to apply:**
```ts
const isOSeriesReasoning = /^o\d/i.test(model); // only for explicit o-series
// Never set temperature — omit it for ALL models to avoid gpt-5 rejection
// Use max_completion_tokens everywhere (not max_tokens)
const params = {
  model,
  messages,
  max_completion_tokens: largeEnough, // 5000+ for structured JSON
  response_format: { type: "json_object" },
};
if (isOSeriesReasoning) params.reasoning_effort = "low";
// Do NOT add temperature for any model
```

**Generation speed:** gpt-5 takes ~90–150 seconds per chapter-batch call. Background seeding
via `nohup node bg-seed-bible.mjs > /tmp/bible-seed.log 2>&1 &` is required; HTTP-proxied
generation via the admin UI will hit browser timeouts for chapter-batch calls.
A seeder run of 247 chapters at concurrency 2 will take ~4–5 hours.

**Background seeder location:** `artifacts/api-server/scripts/bg-seed-bible.mjs`
Check progress: `tail -f /tmp/bible-seed.log`
