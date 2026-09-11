# Jarvis reconciliation — 11 September 2026

## Authority

This audit compares the proven Jarvis checkpoint `1f66e4678e004e78ff0b7ac39d5fd54f55fe2ffa` (reported 91 passing tests across 18 suites) with `release/emmaus-unified`.

No production publish, database operation, secret change, UI replacement, or content migration was performed.

## Already built before consolidation

These capabilities existed at the proven checkpoint and must not be rebuilt:

- GPT-5.6 Luna / GPT-6 Astra routing.
- Canonical, server-owned Emmaus actions and fail-closed resource handling.
- Authenticated active and completed Walk/Journey progress.
- Saved Bible position.
- Current Daily Devotional position.
- Sermon context when Ask Emmaus was opened from a sermon.
- Durable PostgreSQL conversation storage.
- Concise response normalization.
- Natural-language intent routing and verified resource destinations.

The LLM provider is byte-identical between the proven checkpoint and the unified branch.

## Genuine additions after the proven checkpoint

These were not present at `1f66e467...` and are not duplicate rebuilds:

- Direct resolution of “this week's sermon” to the latest verified published sermon.
- Recall of a previously verified recommendation across the same member's conversations.
- Natural recall such as “Show me the Walk you recommended yesterday.”
- Loading the current published Daily Rhythm Scripture, teaching excerpt, reflection and prayer direction into authenticated Jarvis context.
- Resolving vague phrases such as “today's Scripture” against the member's current verified content.
- Limiting outward resource suggestions to the most relevant results.

## Consolidation problem found

The unified workflow `.github/workflows/verify-concise-jarvis.yml` currently runs only:

- `system-instructions.test.ts`
- `response-normalization.test.ts`

It does not run:

- `intent-router.test.ts`
- `canonical-tools.test.ts`
- `context-assembler.test.ts`

Therefore a green “Verify unified Emmaus release” result does not currently prove the member-language, action or context behavior. This is a verification-wiring gap, not a reason to rebuild Jarvis.

## Locked next rule

Before any further Jarvis feature work:

1. Run the complete existing Jarvis suite from the unified branch.
2. Treat the proven checkpoint as the baseline.
3. Add only tests for genuinely new behavior.
4. Never describe a green partial workflow as full Jarvis verification.
5. Do not republish the rejected single-screen UI.
