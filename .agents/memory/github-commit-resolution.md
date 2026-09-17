---
name: GitHub commit resolution
description: How to retrieve a requested GitHub commit when local refs do not contain its short hash.
---

When a user names a GitHub commit that is absent from local refs, query the connected repository’s GitHub commit endpoint before reconstructing the change. Apply only the returned file patch.

**Why:** Replit workspaces can have incomplete or damaged local Git object history, while the connected GitHub repository still exposes the authoritative commit and file-level patch.

**How to apply:** Confirm the repository owner/name from the configured remote, request the commit by short hash, inspect its changed files, and use the exact patch as the source of truth.