---
name: Temporary preview port routing
description: How isolated non-artifact workflows are exposed through the Replit development domain.
---

Temporary workflows with a webview port may not be reachable at the bare development domain when artifact routing is also configured. The explicit port URL can be the working preview address.

**Why:** During an isolated preview, the workflow was healthy locally and on its configured port, while the bare development domain returned 502.

**How to apply:** For a temporary workflow, verify the configured port directly and share the development-domain URL with `:<port>` when the bare domain does not route to that workflow.

When a preview intentionally skips startup migrations, a schema-backed feature flag may remain false even when the development table and index already exist. A read-only schema check can justify enabling that in-memory flag for the preview without running DDL.

**Why:** The Daily Rhythm opening route returned its deliberate 503 guard solely because the normal startup verifier had been skipped; the development ledger schema was already present.

**How to apply:** Check the development schema read-only first, then enable only the corresponding runtime readiness flag in the temporary launcher. Do not infer readiness from the table name alone.