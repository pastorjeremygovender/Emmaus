---
name: Meeting presentation authority
description: Durable synchronization rules for shared media during Room meetings.
---

Presentation state is authoritative only for the currently active meeting session. Start, page, stop, reconnect hydration, and late-join hydration must carry the session ID, full presentation payload, and versioned shared-panel state. Both SSE events and successful REST responses must reject stale session or presentation identities before changing local state. Shared meeting surfaces are visible only after explicit attendance join, and only leaders may close a leader-controlled surface for the group.

**Why:** A mutation can commit just before a meeting is replaced, then its delayed response can arrive after the new session. Partial page payloads can also overwrite valid media fields. Treating one transport as trusted and the other as unchecked lets old media reappear. Room membership or merely opening the Room is not meeting attendance, and participant-local close controls desynchronize the guided experience.

**How to apply:** Commit and return the full state transactionally, broadcast only after commit, replace local state from authoritative reconnect hydration, and route initiating-client responses through the same identity checks used for realtime events. Gate every shared-surface render on active attendance (leaders excepted for control continuity), and do not expose surface-close actions to participants.