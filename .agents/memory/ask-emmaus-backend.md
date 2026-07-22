---
name: Ask Emmaus backend
description: Architecture decisions and extension points for the Ask Emmaus conversation service (api-server).
---

## Overview
The Emmaus conversation service lives entirely in `artifacts/api-server/src/emmaus/`. It streams pastoral AI responses via Server-Sent Events (SSE).

## Files
- `system-instructions.ts` — versioned system prompt (PROMPT_VERSION + buildSystemPrompt()); the SINGLE source of truth for all personality, tone, and structure rules.
- `context-builder.ts` — assembles the dynamic context block injected into the system prompt (entry point, Bible/Journey/Sermon context, user memories).
- `safety-layer.ts` — crisis keyword scanner; runs BEFORE the LLM; returns `safety_handover` response and logs a safety flag.
- `llm-provider.ts` — LLMProvider interface + OpenAIProvider (gpt-4o, needs OPENAI_API_KEY starting with sk-) + MockProvider (deterministic canned responses per conversation type). Factory: `createLLMProvider()`.
- `firestore-model.ts` — TypeScript interfaces for all Emmaus data types + InMemoryConversationStore (default) + ConversationStore interface.
- `conversation-service.ts` — orchestrates the full pipeline; exports `handleConversation()`, `setSseHeaders()`, `listConversations()`, etc.
- `routes/emmaus.ts` — Express route handlers; registered in `routes/index.ts`.

## SSE Event Format
```
data: {"type":"text","content":"..."}  ← streamed text
data: {"type":"done","conversationId":"...","messageId":"...","metadata":{...},"promptVersion":"..."}
data: {"type":"error","message":"..."}
```

## Response metadata
After the pastoral text, the LLM appends a `<EMMAUS_META>{...}</EMMAUS_META>` JSON block.
The service strips this before sending text events and sends it in the `done` event as `metadata`.
Fields: `scripture`, `nextStep`, `recommendations`, `followUpPrompts`, `handoffType`.

## API Routes
- `POST /api/emmaus/conversation` — new or continuing conversation (uses `context.conversationId` to continue)
- `POST /api/emmaus/conversation/:id/message` — append to existing
- `GET /api/emmaus/conversations?userId=` — list stubs
- `GET /api/emmaus/conversation/:id/messages` — get messages
- `POST /api/emmaus/memory` — save approved memory note
- `DELETE /api/emmaus/memory/:id?userId=` — delete memory

## Env vars
- `OPENAI_API_KEY` — starts with `sk-`; when present, uses OpenAIProvider; when absent, uses MockProvider. Never blocks startup.
- `FIREBASE_PROJECT_ID` + credentials — for FirestoreConversationStore (not yet implemented; use InMemory).

## Why the orval types directory was removed
The `schemas: { path: "generated/types", type: "typescript" }` option in `lib/api-spec/orval.config.ts` generated TypeScript types with the same PascalCase names as the Zod schemas in `generated/api.ts`. This caused TS2308 "already exported" errors. Fixed by removing the schemas option — Zod schemas are sufficient; TypeScript types can be inferred with `z.infer<>`.

**How to apply:** If adding new API routes, run `pnpm --filter @workspace/api-spec run codegen` and check for naming conflicts. Do not re-add the schemas option.
