---
name: Supabase auth error contracts
description: Provider error and request-ID shapes that affect Emmaus authentication diagnostics.
---

Supabase/GoTrue password and refresh failures may use the standard `error` field (for example `invalid_grant`) with `error_description`, rather than `error_code`. Replit's pino request ID can also be numeric. The Replit connector SDK retries every HTTP 401, which can mask a provider-auth response.

**Why:** Treating either value as absent caused production diagnostics to report an unhelpful provider code and correlation ID of `unknown`, delaying the distinction between credential rejection and other provider failures. Retrying provider 401 responses can replace the original GoTrue payload with a connector response.

**How to apply:** For Supabase Auth calls, use the connector's one-shot proxy primitives instead of its automatic-401-retry helper. Normalize provider codes from `error_code`, `code`, and then string-valued `error`; convert request IDs to strings before structured logging. Never log provider messages, credentials, tokens, or request bodies.