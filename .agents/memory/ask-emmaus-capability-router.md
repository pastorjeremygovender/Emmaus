---
name: Ask Emmaus capability router
description: Boundary and trust rules for deterministic typed Ask Emmaus requests.
---

Typed Ask Emmaus navigation and reading requests must resolve through the server-owned capability registry and authenticated canonical stores before broad retrieval or model generation. The same conversation service is also a Voice adapter, so requests carrying the authenticated Voice context envelope must remain on the existing Voice retrieval path.

**Why:** Application routes, permissions, progress, publication state, and resource links are authoritative runtime data; model prose must not invent them, and the typed rebuild must not silently change Voice behavior.

**How to apply:** Add new deterministic typed actions to the registry/router and canonical resolver, validate every destination from server-owned data, keep the shared SSE/persistence contract, and preserve the Voice-envelope bypass.

Resource-topic intent must win over Bible-reference fallback when a request names both a sermon-like topic and a Scripture passage. If sermon retrieval returns no verified result, buffer generated prose until final validation so an untrusted sermon mention cannot escape through SSE.

**Why:** Natural requests such as “show me the teaching in John 3” contain a valid reference but are asking for a resource search; streaming model output before retrieval validation can leak fabricated sermon claims.

**How to apply:** Normalize polite prefixes before semantic routing, recognize sermon/topic terms before generic Bible handling, and only release no-result prose after the final sermon redaction pass.

Typed responses must pass through one final server normalizer before SSE completion or persistence; that normalizer owns canonical Scripture prose, resource grounding, deduplication, and display/speakable answer fields. Voice remains outside this boundary.

**Why:** Model metadata and prose are separate trust surfaces, and normalizing only cards or only canonical actions leaves streamed text and conversation history inconsistent.

**How to apply:** Buffer typed model prose until final validation, normalize canonical and model responses through the same function, and keep the authenticated Voice envelope on its existing streaming contract.

Bible-shaped navigation paths must be validated through the canonical book/chapter/verse rules, not only a path-shape regular expression, before they enter metadata or history.

**Why:** A route such as `/bible/read/fakebook/999` has a valid-looking shape but is still an invented destination that can survive into persisted responses.

**How to apply:** Reuse the same route builder used for Bible actions when validating `nextStep` and `nextSteps`; reject impossible references before display or persistence.