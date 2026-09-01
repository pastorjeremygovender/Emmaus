---
name: Pastoral briefing rules
description: Church-scoped policy for the non-persisting Today pastoral briefing.
---

The Today pastoral briefing evaluates a separate church-scoped policy record at read time; it does not create care signals, pastoral records, notifications, or messages. Keep this policy separate from the persisted 18-rule care-signal engine because it needs atomic draft/save behavior, exclusions, and a read-only preview.

**Why:** Leaders need a transparent, reversible way to tune observable care prompts without changing historical signal data or creating hidden side effects.

**How to apply:** Keep preview and Today on the same pure evaluator and server-loaded inputs. Enforce administrator-only authorization server-side, validate thresholds centrally, and preserve source-backed exclusions for test, inactive, visitor, unlinked, administrator, and identity-less records.