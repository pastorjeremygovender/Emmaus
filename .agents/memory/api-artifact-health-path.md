---
name: API artifact health path
description: Replit API artifact publishing probes the artifact preview path in addition to the configured health endpoint.
---

The API artifact's preview path and configured health endpoint must return successful liveness responses during startup, not only after database initialization completes.

**Why:** Replit's artifact router probes `/api` during promotion and can repeatedly restart the process when `/api/healthz` returns 503 while startup migrations are still running. Port detection alone is not enough.

**How to apply:** Keep both `/api` and `/api/healthz` lightweight, unauthenticated, and 200 during startup; expose readiness as response metadata while keeping normal application routes gated until initialization completes.