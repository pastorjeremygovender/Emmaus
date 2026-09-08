---
name: OLD_JOURNEY_IDS safety
description: prod-data-sync deletes every ID in OLD_JOURNEY_IDS on boot — admin-created journeys using those IDs are wiped silently.
---

# OLD_JOURNEY_IDS Safety

## The rule
`OLD_JOURNEY_IDS` in `prod-data-sync.ts` deletes matching journey rows (+ steps + progress) from the DB on **every boot**. It is checked **before** tombstones and does not care whether the rows contain admin-authored content.

## What went wrong
The admin created a new walk with ID `who-is-god` in production on 2026-08-18. That ID was already in `OLD_JOURNEY_IDS` (a legacy cleanup entry). The next redeploy triggered prod-data-sync, which deleted the journey and all 6 steps. The audit log only stores title/status — body content (teaching, scripture, prayer, reflection) was permanently lost.

## Why
`OLD_JOURNEY_IDS` was written early in the project to clean up AI-generated draft journeys with predictable slug-style IDs. The assumption was those IDs were unique to the seed era. Admins can create new walks with any ID, including ones that collide with OLD_JOURNEY_IDS entries.

## How to apply
- **Before adding an ID to `OLD_JOURNEY_IDS`**, verify it has no admin-authored steps in production (i.e. no rows in `journey_steps` with non-seed content). If in doubt, leave it out.
- **Never use generic English-slug IDs** (who-is-god, faith, prayer, church) for new admin-created journeys — these are exactly the IDs most likely to collide with legacy cleanup lists.
- **When removing an ID from OLD_JOURNEY_IDS**, add a comment explaining why it was removed and the date, so future reviewers know it is intentional.
- **The restore pattern**: if an ID is accidentally deleted, recover titles from `content_audit_log` (new_state has title/status but NOT body fields). Body content must be re-authored by the admin.
- **Long-term fix needed**: OLD_JOURNEY_IDS loop should check whether any step has non-empty authored fields before deleting, to prevent silent data loss.
