---
name: Ask Emmaus capability router
description: Boundary and trust rules for deterministic typed Ask Emmaus requests.
---

Typed Ask Emmaus navigation and reading requests must resolve through the server-owned capability registry and authenticated canonical stores before broad retrieval or model generation. The same conversation service is also a Voice adapter, so requests carrying the authenticated Voice context envelope must remain on the existing Voice retrieval path.

**Why:** Application routes, permissions, progress, publication state, and resource links are authoritative runtime data; model prose must not invent them, and the typed rebuild must not silently change Voice behavior.

**How to apply:** Add new deterministic typed actions to the registry/router and canonical resolver, validate every destination from server-owned data, keep the shared SSE/persistence contract, and preserve the Voice-envelope bypass.