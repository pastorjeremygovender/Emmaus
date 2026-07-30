# Production Content Backup — 2026-07-30

Exported before startup-migration cleanup. Source of truth for all live content.

## Collections

| id | title | status | display_order | created_at |
|----|-------|--------|---------------|------------|
| b5ccaefe-10ee-4e61-9fd0-c76c65c72f46 | Coming to Jesus | Published | 0 | 2026-07-30 07:19:16 |
| 6923d3ad-d538-440c-8e5b-35869a736321 | Growing in Christ | Published | 0 | 2026-07-30 07:20:19 |
| af275c65-b972-443a-aa50-f0404d357e82 | Living for Jesus | Published | 0 | 2026-07-30 07:22:39 |
| 00000000-0000-0000-0000-000000000010 | New to Faith | Draft | 10 | 2026-07-30 07:43:15 |

> NOTE: "New to Faith" is a seeded scaffold record. It will be deleted on next production deploy by the cleanup migration in startup-migrations.ts.

## Journeys

| id | title | status | collection_id | type |
|----|-------|--------|---------------|------|
| coming-to-jesus | Coming to Jesus | Draft | 00000000-0000-0000-0000-000000000010 | core |
| beginning-your-new-life | Beginning your New Life | Draft | b5ccaefe (Coming to Jesus) | core |
| created-in-god-s-image | Created in God's Image | Draft | b5ccaefe (Coming to Jesus) | core |
| jesus-saves | Jesus Saves! | Draft | b5ccaefe (Coming to Jesus) | core |
| walking-with-god | Walking with God | Draft | b5ccaefe (Coming to Jesus) | core |
| what-went-wrong | What went wrong | Draft | b5ccaefe (Coming to Jesus) | core |
| who-is-god | Who is God? | Draft | b5ccaefe (Coming to Jesus) | core |
| baptism | Baptism | Draft | 6923d3ad (Growing in Christ) | core |
| church | Church | Draft | 6923d3ad (Growing in Christ) | core |
| faith | Faith | Draft | 6923d3ad (Growing in Christ) | core |
| holy-communion | Holy Communion | Draft | 6923d3ad (Growing in Christ) | core |
| prayer | Prayer | Draft | 6923d3ad (Growing in Christ) | core |
| the-bible | The Bible | Draft | 6923d3ad (Growing in Christ) | core |
| the-holy-spirit | The Holy Spirit | Draft | 6923d3ad (Growing in Christ) | core |
| following-jesus-every-day | Following Jesus Every Day | Draft | af275c65 (Living for Jesus) | core |
| living-with-hope | Living with Hope | Draft | af275c65 (Living for Jesus) | core |
| overcoming-temptation | Overcoming Temptation | Draft | af275c65 (Living for Jesus) | core |
| serving-others | Serving Others | Draft | af275c65 (Living for Jesus) | core |
| the-fruit-of-the-spirit | The Fruit of the Spirit | Draft | af275c65 (Living for Jesus) | core |
| 15-minutes-with-jesus | 10 Minutes with Jesus | Published | (none — daily rhythm) | daily-rhythm |

> NOTE: "coming-to-jesus" belongs only to the seeded "New to Faith" collection and has no real content. It will be deleted on next production deploy.
