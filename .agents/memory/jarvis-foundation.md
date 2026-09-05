---
name: Jarvis foundation
description: Typed Ask Emmaus boundary and authenticated context rules for future assistant work.
---

The Jarvis foundation is an additive typed boundary around the existing Ask Emmaus pipeline. The server assembles authenticated, owner-scoped account context inside a `jarvis.context.v1` envelope and emits a `jarvis.v1` response contract containing pastoral prose, validated Scripture references, published Emmaus content references, and server-owned actions. The contract boundary accepts only recognized resource types and safe internal routes. Legacy metadata remains for compatibility with existing clients.

**Why:** Emmaus already has canonical action/resource validation and a separate Voice contract. Replacing those paths or trusting model/client routes would weaken security and risk regressions in mobile/PWA and Voice behavior.

**How to apply:** Extend the server assembler and canonical registries for new member capabilities. Keep routes, resource IDs, and identity server-derived; ignore browser-supplied names; report source failures by safe source name only; and keep Voice outside the typed Jarvis path unless its contract is deliberately versioned too.