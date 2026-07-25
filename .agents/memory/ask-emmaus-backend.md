---
name: Ask Emmaus backend
description: Conversation service, SSE streaming, safety layer, system instructions source of truth.
---

# Ask Emmaus Backend

- `POST /api/emmaus/conversation` — SSE streaming conversation endpoint
- Mock + OpenAI providers; safety layer; in-memory store
- `system-instructions.ts` is the single source of truth for Emmaus persona

See `artifacts/api-server/src/routes/emmaus.ts` for the route implementation.
