---
name: Ask Emmaus release gate
description: Release-quality checks for typed Ask Emmaus grounding, latency, and authenticated verification.
---

Typed Ask Emmaus output is intentionally buffered until server-side Scripture/resource normalization completes, so time to first model token is not the same as time to first visible text.

**Why:** Releasing raw model text before final validation can expose unsupported sermons, resources, or routes and make streamed text disagree with persisted history.

**How to apply:** Measure both model TTFT and final visible SSE text; keep direct canonical actions on the fast path, and treat authenticated desktop/mobile click-through as a separate release requirement.