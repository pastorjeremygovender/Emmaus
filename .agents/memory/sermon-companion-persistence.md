---
name: Sermon Companion persistence
description: Generated companions require a verified five-day database commit and rollback-safe replacement.
---

# Sermon Companion persistence

Generated Sermon Companions must not be considered ready until the database contains one valid parent and exactly five uniquely numbered child entries (days 1–5). Replacements must insert and verify the new content before deleting the previous companion inside one transaction; retries for the same sermon are serialized.

**Why:** A partial first save or delete-before-create failure can leave the editor reporting success with missing devotional days, or destroy an authored companion that should have remained recoverable.

**How to apply:** Keep generation responses and processing-stage transitions behind a canonical refetch/validation boundary. Use the rollback-safe replacement operation for audio-first retries, and preserve authored companion data whenever generation or persistence fails.