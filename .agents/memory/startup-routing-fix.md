---
name: Startup routing fix
description: The root cause of "always opens on My Bible" and the authoritative fix applied.
---

# Startup routing — root cause and fix

## The bug

`App.tsx` used an **exact-match** list to decide whether to redirect through Welcome on cold launch:

```ts
const TAB_ROOT_PATHS = ['/bible', '/journeys', '/personal'];
TAB_ROOT_PATHS.includes(location)   // only matched the three root strings
```

Any deep path under those tabs — `/bible/read/john/3`, `/bible/books`, `/journeys/explore`, etc. — was NOT matched. The browser restores the last URL on reopen, so a user who was reading a Bible chapter always reopened there, Welcome never ran, and My Emmaus was never restored.

The same exact-match hole existed in the `visibilitychange` listener (warm PWA resume path).

**Why it was "every later launch":** The browser remembers the last URL independently of site data; clearing site data did not fix it.

## The fix (App.tsx)

Replaced exact match with `startsWith` matching via a helper:

```ts
const TAB_PREFIXES = ['/bible', '/journeys', '/personal'];

function isTabPath(path: string): boolean {
  return TAB_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}
```

Applied in both the startup `useEffect` (cold launch) and the `visibilitychange` listener (warm PWA resume).

**Why:** Welcome is already the correct single source of truth for startup navigation. This fix simply ensures it is always reached on launch from any tab path, regardless of depth.

## Name persistence fix (AuthContext.tsx + Onboarding.tsx)

`updateName()` and `signUp()` previously called `saveServerProfile()` as fire-and-forget. If the network failed silently, the server never stored the name; when localStorage was later cleared (iOS OS eviction), the name was gone.

- `updateName` is now `async` and awaits `saveServerProfile`.
- `signUp` now awaits `saveServerProfile`.
- `Onboarding.handleNameContinue` now awaits `updateName` before advancing to step 1.
- The Continue button shows "Saving…" and is disabled while the save is in flight.

**Why:** The server profile is the permanent record. Awaiting ensures it exists before the user navigates away from onboarding.
