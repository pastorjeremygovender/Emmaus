---
name: Appearance preferences
description: Durable rules for dark-mode surfaces, text-size scaling, and preference persistence.
---

Text size must scale shared typography utilities and fixed-pixel text classes, not the root element, browser zoom, transforms, spacing, or touch targets. The supported levels are approximately 100%, 112.5%, and 125%.

**Why:** Root scaling also enlarges layout dimensions expressed in rem and can cause mobile clipping, overflow, and unstable controls. Typography-only scaling keeps reading content accessible without distorting navigation and touch targets.

**How to apply:** New user-facing text should use the shared typography utilities. Dark surfaces should use semantic tokens or muted section-specific tints. Apply the last local preference before React renders, then reconcile with the authenticated account; failed writes stay locally pending for retry.