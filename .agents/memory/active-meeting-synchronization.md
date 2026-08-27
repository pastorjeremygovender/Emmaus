---
name: Active meeting synchronization
description: Durable rules for Room attendance, active Discussion access, and multi-device reconciliation.
---

Opening a Room is observation only and must never create attendance. Starting a meeting records the leader against the newly created session transactionally; members join explicitly. Attendance reads and Discussion authorization must be scoped by room ID, session ID, authenticated user ID, and active `left_at` state. Other devices reconcile through authoritative refetches after attendance events and lifecycle/connection recovery rather than trusting local navigation state.

**Why:** A page-open attendance side effect made members appear present without pressing Join, while stale room/session context allowed devices to disagree about who was in the current meeting.

**How to apply:** Preserve explicit Join Meeting UI and server-returned attendance rows. Clear participant state when the active session changes, refetch on session/realtime/focus/visibility/online transitions, and rehydrate Discussion room context from the server on direct or reload navigation. Following the leader controls study navigation only; it must not be coupled to attendance, presence, membership, or chat.