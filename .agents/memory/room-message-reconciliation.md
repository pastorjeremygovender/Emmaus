---
name: Room message reconciliation
description: Durable identity rule for reconciling optimistic Group Discussion posts with POST responses and SSE echoes.
---

Every optimistic Room message must carry a client-generated message ID that is sent with the POST and copied onto both the POST response and the transient SSE broadcast. Reconcile by this ID before considering field-based matching.

**Why:** A real retained/mobile session displayed an optimistic post and its single stored server row twice because mutable fields such as authenticated user identity or discussion scope can differ between client and server payloads. Desktop tests did not reproduce that shape mismatch.

**How to apply:** Preserve the client message ID through any future Room chat API or realtime refactor, keep a synchronous in-flight send guard, and verify click, Enter, rapid repeated input, delayed SSE, two clients, and reload.