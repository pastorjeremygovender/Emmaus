---
name: Release branch commit path
description: How release commits are written for this workspace when local Git remotes are unavailable.
---

Release commits for the Emmaus release branch must be created through the connected GitHub API. Read the branch head first, create blobs and a tree from that head, create one commit, and update the branch without force-pushing.

**Why:** The workspace intentionally has no usable local Git remote, and restoring or rewriting local history can bypass the required connected-repository audit trail.

**How to apply:** Before a release commit, preserve the current branch parent, include only the intended source files, verify the returned commit SHA and parent, and do not publish or deploy unless separately requested.