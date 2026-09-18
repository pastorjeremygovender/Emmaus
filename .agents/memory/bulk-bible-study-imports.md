---
name: Bulk Bible Study imports
description: Durable safety and ownership rules for importing structured chapter overviews and passage Study content.
---

Bulk Bible Study imports reuse the canonical Study records rather than creating a parallel content system. Preview is read-only, and save reparses the original source on the server instead of trusting client-generated preview data.

**Why:** Imported content must appear in the existing member Bible Study experience without giving a stale or manipulated client payload authority to write data.

**How to apply:** Keep imports chapter-atomic and serialize concurrent work on the same chapter. Reject duplicate chapter declarations and any duplicate or overlapping incoming passage ranges across the entire document.

Skip preserves existing records. Replace changes only importer-owned Study fields. Merge fills only empty importer-owned fields and must not silently unpublish existing Published content. Explicit Draft replacement may downgrade status; publishing always requires an explicit admin confirmation.

**Why:** Existing authored content, sermon connections, Bible text, user notes, highlights, saved verses, and unrelated metadata must survive every import mode.

**How to apply:** Keep chapter overview seed synchronization insert-only, resolve existing range conflicts by interval overlap, and prefer the narrowest matching Published range when a member taps a verse.