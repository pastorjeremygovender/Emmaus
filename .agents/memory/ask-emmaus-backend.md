---
name: Ask Emmaus backend
description: Conversation service, SSE streaming, safety layer, system instructions source of truth.
---

# Ask Emmaus Backend

- `POST /api/emmaus/conversation` — SSE streaming conversation endpoint
- Mock + OpenAI providers; safety layer; in-memory store
- `system-instructions.ts` is the single source of truth for Emmaus persona

See `artifacts/api-server/src/routes/emmaus.ts` for the route implementation.

## Durable safeguards

Trusted member profile lookup must support both the verified subject and the
account email, because existing member records may use either identity key.

**Why:** A subject-only lookup silently removed preferred-name personalisation
for valid members whose profile had been created before subject binding.

**How to apply:** When resolving authenticated profile data for Emmaus, prefer
the verified subject match but fall back to the verified account email; never
trust the browser-supplied display name.

Resource prompts must include canonical resource IDs as well as titles and
routes.

**Why:** Validation correctly rejects model-created IDs, but giving the model
only titles and paths makes every recommendation unverifiable and therefore
silently disappear.

**How to apply:** Treat catalogue IDs as the model's only recommendation keys;
the server resolves the final route from the live publication-safe catalogue.

Final Ask Emmaus prose must be independently scanned for Bible references after
model metadata validation.

**Why:** Models can mention valid passages in natural prose without copying
them into `scriptureReferences`, which otherwise leaves visible references
unclickable.

**How to apply:** Extract book-qualified references, validate chapter/range
against the canonical Bible structure, merge deduplicated refs, and generate
links only in trusted application code.

Ask Emmaus prose may stream before metadata validation only through the guarded,
redacted SSE path; the final metadata answer remains canonical.

**Why:** Waiting for the complete model response made the UI appear frozen,
while emitting raw provider chunks could leak metadata, URLs, or app routes.

**How to apply:** Keep a short provider-output tail to catch split tags and
unsafe links, emit only redacted chunks, and reconcile the client message with
`metadata.answer` when the `done` event arrives.
