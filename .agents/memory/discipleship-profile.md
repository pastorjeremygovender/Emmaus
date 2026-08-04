---
name: Discipleship Profile architecture
description: PersonPage is a spiritual Discipleship Profile — section order and primary question encode shepherding priority, not data-model hierarchy.
---

## The primary question
"How is this person doing spiritually, and should someone lovingly follow up?"
Everything on the page serves that question. Attendance is one section, not the frame.

## Section order (shepherding priority)
1. **Spiritual Snapshot** — engagement status badge + key stats (last at church, active walk, Emmaus activity)
2. **Emmaus Journey** — Walks, Rooms, Daily Rhythm, Sermon Companions
3. **Pastoral Care** — open alerts (with dismiss + Schedule Visit), visits
4. **Attendance** — history + expectations
5. **Profile & Admin** — contact info, account link

## Engagement status logic (server-side, `getPersonProfileSummary`)
- `needs_care`  — `openCareSignalCount > 0`
- `active`      — last attendance or Emmaus activity within 14 days
- `fading`      — last activity 15–90 days ago
- `unknown`     — no data or > 90 days

## Section/Card shell pattern
`<Section title icon iconColor action>` and `<Card>` / `<CardHeader>` are shared
inline helpers in PersonPage.tsx. Adding a new section (Serving, Prayer, Notes) =
one new `<Section>` block + one `<Card>` block. Nothing else changes.

## Profile-summary endpoint
`GET /api/pastoral/people/:personKey/profile-summary` — resolves emmausUserId
from `linked_user_id` for pastoral_persons, runs two parallel DB calls
(attendance + activity), returns `PersonProfileSummary`. Requires recorder access.

**Why:** Computing engagement server-side keeps the logic in one place; the client
just reads the status and renders the appropriate badge/prompt/colour.

## Future sections (architecture ready for):
Serving, Prayer Requests, Pastoral Notes, Giving — add as isolated Section blocks.
No rearchitecting needed.
