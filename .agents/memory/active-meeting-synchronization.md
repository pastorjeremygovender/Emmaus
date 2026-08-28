---
name: Active meeting synchronization
description: Durable rules for Room attendance, active Discussion access, and multi-device reconciliation.
---

Opening a Room is observation only and must never create attendance. Starting a meeting records the leader against the newly created session transactionally; members join explicitly. Attendance reads and Discussion authorization must be scoped by room ID, session ID, authenticated user ID, and active `left_at` state. Other devices reconcile through authoritative refetches after attendance events and lifecycle/connection recovery rather than trusting local navigation state. Each active session has one persisted Discussion identity; the leader's open command is delivered over the authoritative meeting SSE channel. Live meeting format is explicit: text needs no LiveKit, audio publishes microphone only, and video publishes camera plus microphone.

**Why:** A page-open attendance side effect made members appear present without pressing Join, while stale room/session context allowed devices to disagree about who was in the current meeting. A local chat-open action could similarly split devices into different channels; a durable session identity makes history and realtime delivery converge. The new message column is additive so older development/test databases can still post legacy room messages during rollout.

**How to apply:** Preserve explicit Join Meeting UI and server-returned attendance rows. Clear participant state when the active session changes, refetch on session/realtime/focus/visibility/online transitions, and rehydrate Discussion room context from the server on direct or reload navigation. Following the leader controls study navigation only; it must not be coupled to attendance, presence, membership, or chat. Validate any supplied discussion ID against the room before reading, streaming, or writing.

Shared Meeting Tools are a single authoritative lifecycle: replacing or closing a tool must clear its durable poll/presentation/scripture state before broadcasting, and a stale close request must not close a newer tool.

**Why:** SSE delivery can be delayed or missed, so hiding a panel locally is insufficient; reconnect hydration must not resurrect a superseded tool or let an out-of-order close erase the current one.

**How to apply:** Persist the active tool on the room session, clear superseded durable artefacts server-side, broadcast the replacement/close after persistence, and ignore close requests whose tool no longer matches the active session tool.