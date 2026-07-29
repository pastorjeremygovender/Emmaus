---
name: Preferred name & greeting
description: How user names are collected, stored, displayed, and blocked across the app.
---

## Name storage
`User.preferredName` (string) in AuthContext. Persisted in `localStorage['emmaus_demo_user']`.
`DEMO_USER.preferredName` is `''` (empty) — not 'Friend'. New users have no name until they set one.

## updateName
`updateName(name: string)` added to AuthContext + AuthContextType. Updates `user.preferredName` in state and localStorage. Used by Onboarding step 0 and Personal profile edit.

## Onboarding step 0
Steps are `0 | 1 | 2`. Step 0 shown when `!user?.preferredName?.trim()`.
- Input: first name. Button: Continue (disabled until non-empty). "Skip for now" link bypasses.
- On continue: calls `updateName(name)`, then `setStep(1)`.
- If name already set (from auth/signUp), starts at step 1 immediately.

## Greeting logic (Walk.tsx)
```ts
const rawPreferredName = user.preferredName?.trim();
const greetingFirstName = rawPreferredName && !rawPreferredName.includes('@')
  ? rawPreferredName.split(' ')[0] : null;
// renders: greetingFirstName ? `${greeting}, ${greetingFirstName}.` : `${greeting}.`
```
Never shows 'Friend' — because DEMO_USER.preferredName is now ''.

## Blocked names
`BLOCKED_DISPLAY_NAMES` in `DailyRhythmReading.tsx` includes `'friend'` so `resolveDisplayName('Friend')` → undefined.

## Profile editing (Personal.tsx)
Inline edit in the profile header. Hover the name → pencil icon appears. Click → input with ✓/✗ buttons.
Save calls `updateName(nameInput.trim())` and shows a toast.

## Rooms demo names
All `'demo-user-1': 'Friend'` entries changed to `'demo-user-1': 'Member'` in 7 rooms/admin files.
`displayName` functions updated to handle empty `preferredName` — show 'You' instead of ' (you)'.

## SermonCompanionReader
`firstName` now derived without `?? 'Friend'` fallback — undefined when no name set.

## SermonEditor preview
`memberName={undefined}` (was `memberName="Friend"`). Preview shows nameless greeting.
