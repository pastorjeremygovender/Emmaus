---
name: API artifact health path
description: Replit API artifact publishing probes the artifact preview path in addition to the configured health endpoint.
---

The API artifact's preview path must return a successful liveness response, not only the explicit `/healthz` endpoint.

**Why:** Replit's artifact router probed `/api` during promotion; a 404 there prevented port 8080 from being considered ready even though `/api/healthz` returned 200.

**How to apply:** Keep both `/api` and `/api/healthz` lightweight, unauthenticated, and returning the validated health response.