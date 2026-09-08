---
name: Pastoral discipleship resource allocation
description: Admin person profiles must classify discipleship records from source types and stable IDs, not display titles.
---

The pastoral Discipleship profile must allocate resources from authoritative source records: Daily Rhythm by its `daily-rhythm` journey type, standalone Walks by `walk` with no collection, Journeys by a non-null collection identity or non-Walk journey type, Daily Devotionals and Sermon Companions from their own progress tables, and Groups only from joined room records.

**Why:** Display-title matching caused same-named Walks and Groups to be conflated and put Daily Rhythm/devotional records under the wrong headings.

**How to apply:** When changing the pastoral read model or profile presentation, preserve source IDs/types in the response and keep same-name resources independent; do not infer membership from titles.