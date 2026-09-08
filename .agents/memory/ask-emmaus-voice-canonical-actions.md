---
name: Ask Emmaus and Voice canonical actions
description: Shared safety contract and server-owned action resolution for typed and spoken Emmaus requests.
---

Bible references in natural-language questions are evidence for retrieval, not navigation commands. Only anchored explicit read/open imperatives may create Bible actions; all executable resource routes must come from the authenticated server catalogue rather than model text.

**Why:** Voice and typed Ask Emmaus previously classified the same request differently, and model-generated routes or Bible-like wording could cause unsafe or surprising navigation.

**How to apply:** Extend the shared intent contract first, keep client route checks as defense in depth, and resolve OPEN/READ/CONTINUE actions only against published, tenant-scoped catalogue records and server-owned routes. Surface retrieval failures as retryable UI state.