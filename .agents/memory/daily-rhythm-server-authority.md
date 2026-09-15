---
name: Daily Rhythm server authority
description: Daily Rhythm visibility is independent from the server-assigned progression day.
---

Daily Rhythm progress is server-authoritative: each acknowledged local-date opening advances at most one assigned published step, while completion records remain independent history. Every published non-completion day is readable and may be deliberately completed; only the assigned day drives automatic opening. The default timezone is Africa/Johannesburg, and first-open-per-day is persisted rather than inferred from browser localStorage. Startup requests carry a per-launch session claim so duplicate Welcome/Walk/auth-remount requests return the same destination.

**Why:** Client clocks, localStorage, multiple devices, browser navigation, and duplicate React/auth startup effects previously allowed a completed day or first-open destination to resolve inconsistently.

**How to apply:** Validate direct completion requests against published, non-completion content rather than the assigned day; leave the assigned day unchanged on completion. Serialize opening/date checks with a row lock, advance only one step when a new local date is acknowledged, make duplicate calls idempotent by launch session, and treat review/completion history as progression-neutral.

The opening ledger is the single launch authority. Authenticated members at `/`, on deep links, or returning from an invite must pass through it; only `/admin` and the auth/onboarding transition are intentional gate exemptions. Pending internal destinations may resume only after confirmed Daily Rhythm completion.

**Why:** Treating `/` or an authenticated invite as public allowed a member to remain on the splash or jump directly into a group, bypassing the required opening.

**How to apply:** Keep Welcome limited to splash/auth/onboarding concerns, preserve validated invite/deep-link destinations separately from the server decision, and fail closed when the opening request cannot be resolved.

Completion must return the committed opening decision to the client, and the gate must accept that decision in place while the completion card remains mounted. The cold-launch brand presentation belongs to the application gate, not to Welcome.

**Why:** Clearing the gate after completion unmounted the reader before the member could choose where to go, while a splash owned by Welcome was skipped whenever the gate blocked an authenticated cold launch.

**How to apply:** Treat `emmaus:opening-completed` as a handoff of the server response, not as a request to re-resolve startup; keep the splash animation independent from route authority and only fade it after auth/opening readiness.

The authoritative response must also be the cache-invalidation boundary: when startup or resume resolves, refresh shared journey state and keep member day rendering held until that response is available. Notification links should enter a resolver route rather than carrying a stale numbered day.

**Why:** PWA resume, foreground restoration, and notification taps can outlive the client state that created the original route; rendering cached progress first causes stale-day flashes or opens the wrong day.

**How to apply:** Use one shared client resolver for Walk, day navigation, and history; dispatch a resolution event after opening; bypass conditional browser caching for authenticated state endpoints; expose all published lesson entries to members; filter completion steps from the day list.