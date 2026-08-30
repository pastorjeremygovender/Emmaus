---
name: Persistent meeting media
description: Durable rules for route-safe LiveKit ownership and mode-aware browser device access.
---

Keep the active LiveKit room in an app-level provider above routed pages. Room, Bible, chat, notes, presentation, and Ask Emmaus surfaces consume that one connection rather than owning or recreating it.

**Why:** Mounting LiveKit inside the Room route disconnected participants when shared meeting tools navigated elsewhere. Reading mutable participant flags directly also left mute labels stale, and unconditional device discovery exposed camera UI and permission state in audio meetings.

**How to apply:** Treat meeting mode and join intent as separate inputs. Text and listen-only use no media APIs; audio may access only the microphone; video accesses camera only when explicitly enabled. Subscribe to LiveKit participant events for control state, and disconnect only on explicit leave/end.