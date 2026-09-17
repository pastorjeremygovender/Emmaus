---
name: Daily Rhythm server authority
description: Daily Rhythm visibility is independent from the server-assigned progression day.
---

Daily Rhythm progress is server-authoritative: completion records remain independent history, every published non-completion day is readable and may be deliberately completed, and the widget reads the server's calendar-available entry. Normal web and app-icon launches do not consume the opening ledger or auto-open Daily Rhythm.

**Why:** My Emmaus must remain the stable normal home; widget content still needs server-authoritative day selection across devices and calendar dates.

**How to apply:** Validate direct completion requests against published, non-completion content rather than the assigned day; leave the assigned day unchanged on completion. Serialize opening/date checks with a row lock, advance only one step when a new local date is acknowledged, make duplicate calls idempotent by launch session, and treat review/completion history as progression-neutral.

The opening ledger is retained for explicit Daily Rhythm opening APIs, but it is
not a normal web/icon launch gate. Widget routes and other deliberate deep links
must remain direct and may not be rewritten to a different assigned day.

**Why:** The normal home and explicit content destinations have different
intent; applying one opening rule to both caused the wrong first screen.

**How to apply:** Keep Welcome limited to splash/auth/onboarding concerns, preserve validated invite/deep-link destinations separately from the server decision, and fail closed when the opening request cannot be resolved.

Completion must return the committed opening decision to the client, and the gate must accept that decision in place while the completion card remains mounted. The cold-launch brand presentation belongs to the application gate, not to Welcome.

**Why:** Clearing the gate after completion unmounted the reader before the member could choose where to go, while a splash owned by Welcome was skipped whenever the gate blocked an authenticated cold launch.

**How to apply:** Treat `emmaus:opening-completed` as a handoff of the server response, not as a request to re-resolve startup; keep the splash animation independent from route authority and only fade it after auth/opening readiness.

The authoritative response must also be the cache-invalidation boundary: when startup or resume resolves, refresh shared journey state and keep member day rendering held until that response is available. Notification links should enter a resolver route rather than carrying a stale numbered day.

**Why:** PWA resume, foreground restoration, and notification taps can outlive the client state that created the original route; rendering cached progress first causes stale-day flashes or opens the wrong day.

**How to apply:** Use one shared client resolver for Walk, day navigation, and history; dispatch a resolution event after opening; bypass conditional browser caching for authenticated state endpoints; expose all published lesson entries to members; filter completion steps from the day list.