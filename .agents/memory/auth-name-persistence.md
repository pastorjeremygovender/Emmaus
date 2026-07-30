---
name: Auth name persistence
description: How the member's preferred name is stored and restored across sign-outs and mobile localStorage eviction.
---

# Auth name persistence

## Rule
The server-side `user_profiles` table (keyed by email) is the permanent source of truth for `preferredName`. localStorage is a local cache only.

**Why:** On mobile, iOS/Android can evict localStorage. The previous system was localStorage-only, causing members to lose their name and see the onboarding name prompt again.

**How to apply:**
- `updateName` in AuthContext must BOTH update localStorage AND `POST /api/users/profile`
- `signUp` must `POST /api/users/profile` immediately after creation (fire-and-forget)
- On startup, after reading localStorage, `GET /api/users/profile?email=` is called to refresh the name from the server. `loadingProfile` is `true` until this completes.
- `signIn` for regular users: (A) first preserves any existing name from localStorage, (B) if still empty, calls `GET /api/users/profile?email=` to recover from server
- `signIn` was the primary bug source — it unconditionally overwrote localStorage with the empty DEMO_USER template, wiping the saved name on every sign-in

## loadingProfile state
`AuthContext` exposes `loadingProfile: boolean` (true during startup server fetch).
- `Welcome.tsx` waits for `loadingProfile` before routing decisions
- `Onboarding.tsx` treats `loadingProfile = true` as "has name unknown" — uses a `useEffect` to advance to step 1 once profile loads and name is confirmed
- `Welcome.tsx` routing: `!isOnboarded() && !user.preferredName?.trim()` is the onboarding gate — both conditions must be true; a server-restored name short-circuits the prompt and calls `markOnboarded()` to repair the lost flag

## Server endpoints
- `GET /api/users/profile?email=` → `{ preferredName: string }` (returns `""` for unknown emails, never 404)
- `POST /api/users/profile` body `{ email, preferredName }` → upsert
- Email is lowercased at the server; lookup is case-insensitive

## Table
`user_profiles (email TEXT PRIMARY KEY, preferred_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ)`
Created idempotently in `startup-migrations.ts`.
