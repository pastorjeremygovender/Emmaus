---
name: Startup migrations policy
description: What startup-migrations.ts is allowed to do, and what was removed for violating content persistence rules.
---

# Startup migrations policy

## Rule
`startup-migrations.ts` may only run **schema DDL** (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS) and **data cleanup DELETEs** against known seeded scaffold IDs. It must never INSERT default content or UPDATE existing content rows based on their current value.

**Why:** Every UPDATE or INSERT in startup migrations runs on every boot, including production restarts triggered by code deploys. This causes admin-created content to be overwritten or deleted content to reappear.

## What was removed (and why)
Two migrations were removed because they overrode admin content:

1. **Status restore** — forced `15-minutes-with-jesus` back to `Published` if it was `Archived`. An admin who intentionally Archives this journey would see it silently restored on next restart. Removed.

2. **Title rename** — forced title back to `10 Minutes with Jesus` if it differed. An admin who renames this journey would see the rename silently reverted. Removed.

Both had already done their job in all environments before removal (the journey is correctly `daily-rhythm` / `Published` / `10 Minutes with Jesus`).

## What remains (safe)
- Schema DDL: ALTER TABLE ... ADD COLUMN IF NOT EXISTS (sermon_companion, devotional tables)
- Schema DDL: CREATE TABLE IF NOT EXISTS (sermon_companion, devotional, progress tables)
- Type promotion: `15-minutes-with-jesus` core → daily-rhythm WHERE type is still 'core' (structural, not content — guarded so it's a true one-time change)
- Cleanup DELETEs: removes seeded `00000000-...-0010` collection and `coming-to-jesus` journey by fixed ID (idempotent — harmless when already gone)

## How to add future one-time data migrations
For any future data change that must run exactly once:
- Gate it with a WHERE clause that makes it a true no-op once applied (e.g. `WHERE status = 'old-value'`)
- Never use WHERE NOT EXISTS with an INSERT — that is a seed pattern
- Document why the guard is safe and when it becomes a permanent no-op

## Persistence test result (2026-07-30)
- Created "Deployment Persistence Test" collection → survived server restart ✓  
- Deleted it → did not reappear after second server restart ✓
