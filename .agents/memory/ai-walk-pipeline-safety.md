---
name: AI Walk Pipeline Safety
description: Four critical/high fixes applied to the AI walk creation pipeline to prevent data loss, orphan journeys, and content resurrection.
---

# AI Walk Pipeline Safety Rules

## Rules (apply when touching journey creation, deletion, or prod-data-sync)

**Orphan cleanup on AI build failure**
- `journeyId` is hoisted before the `try` block in `POST /journeys/ai-build`
- The `catch` block deletes both `journey_steps` and `journeys` rows if `journeyId` was set before the error
- **Why:** step creation loops can fail mid-way (empty blocks, DB error), leaving a Draft journey with 0–N steps that the admin can't see clearly and that wastes content slots.

**Tombstone before delete, not after**
- In `DELETE /journeys/:id` (permanent), the `reseed_tombstones` insert runs BEFORE `permanentDeleteJourney()`
- **Why:** if the server restarts between the delete and the tombstone write, prod-data-sync resurrects the journey from seed on the next boot. Tombstone-first closes that window.

**prod-data-sync must NOT delete steps by exclusion list**
- The old "clear stale null-titled steps for coming-to-jesus" block (DELETE WHERE id NOT IN dev seed) was removed
- **Why:** it deleted admin-authored production steps on every boot. The COALESCE/NULLIF guards on step upsert are sufficient to protect authored content.
- Do NOT reintroduce per-journey step cleanup by exclusion. Use tombstones for journey-level cleanup only.

**Step count mismatch = hard failure**
- `generateStructuredJourney()` in `journey-ai.ts` throws if `parsed.steps.length !== payload.length`
- **Why:** the old code silently trimmed — the walk got created with fewer steps than requested, which the admin might not notice. The orphan-cleanup in the route then deletes the partial journey and the user sees a retry prompt.

## How to apply
- Any new delete flow must insert a tombstone FIRST, then delete.
- Any new AI content generation loop that creates DB rows before all content is validated must hoist the primary ID and clean up in the catch block.
- prod-data-sync step upserts may only use COALESCE/NULLIF (preserve authored), never delete by exclusion.
