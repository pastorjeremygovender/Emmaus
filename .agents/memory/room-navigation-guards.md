---
name: Room navigation guards
description: Constraints that keep authenticated room navigation and asynchronously loaded room detail pages stable.
---

Authenticated room navigation is an in-session action and must not be intercepted by the Daily Rhythm opening decision. Any component that loads room data asynchronously must keep every React hook above loading, error, and not-found returns.

**Why:** A room can successfully return 200 and still appear not to open if the global opening gate redirects the route or React changes the hook count when the detail arrives.

**How to apply:** When changing OpeningGate or RoomDetail, preserve the room-path exemption and test both the route guard and the null-to-loaded render transition.