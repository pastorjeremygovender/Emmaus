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

An API restart is a terminal event for an in-flight shared Ask Emmaus provider
stream. On boot, convert any persisted `generating` request to a failed,
retryable outcome; new requests must claim the session row under a lock and
reject claims while another generation is still active.

**Why:** Provider iterators live only in the API process, while session metadata
survives it. Without boot recovery, reconnecting members see a permanent
spinner; without an atomic claim, retries or multiple leaders can start
overlapping generations.

**How to apply:** Keep the failed request in the active tool metadata so SSE
hydration can show the question and recovery message. Allow a new claim only
from failed/completed state, and use the same locked transition for every
shared-generation start.

While a shared Ask Emmaus request is generating, connected clients must also
periodically reconcile the active session metadata. A saved completed or failed
state is authoritative even when the one-time SSE completion event was missed.

**Why:** A provider can complete and persist successfully while a browser loses
the completion event, leaving the visible panel spinning despite a full answer
already existing in the database.

**How to apply:** Poll only during active generation, match the persisted request
identity, then stop polling as soon as the state becomes completed/failed or the
tool is closed/replaced.

Shared Ask Emmaus is a live group discussion aid, so it must use a bounded fast
model budget and must not await a durable database write before broadcasting
every streamed token. Persist partial text on a short interval/size threshold,
then always persist the final completed answer.

**Why:** A deep model with a 6,000-token budget plus one database round trip per
chunk made a whole Group wait far too long. The bounded/throttled path produced
first visible text and full completion in about two seconds in a real Room test.

**How to apply:** Keep private/deep Ask Emmaus routing separate from the shared
Room path. Preserve immediate SSE delivery, periodic reconnect-safe snapshots,
final persistence, stale-request cancellation, and the existing retryable timeout.
