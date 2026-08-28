---
name: Shared room tool lifecycle
description: Durable synchronization rules for shared Room tools and group Ask Emmaus.
---

The session event stream is the authoritative coordination channel for shared
Room tools, while the active session metadata is the reconnect/late-subscriber
source of truth. A page that owns a separate message stream must also subscribe
to session events when it renders a shared tool.

**Why:** Group Discussion is rendered on its own route, so listening only to
message SSE cannot receive a leader's tool-close event. Shared Ask Emmaus can
also begin or finish while a browser is reconnecting; ephemeral chunks alone
leave a member stuck in a loading state.

**How to apply:** Persist the active tool and request lifecycle in the session
metadata, include a request identity on streamed events, ignore events for
older sessions/requests, and provide both a server timeout and a client
retryable timeout for long-running generation.