---
name: Launch Board P2 fixes — session 31 Jul 2026
description: Durable patterns and decisions from the P2 quality-fix pass on the launch-13-august branch.
---

## Atomic devotional progress update (P2-2)
`devotional-store.markDayComplete` uses Drizzle's `onConflictDoUpdate` with a `sql\`\`` expression
(`CASE WHEN NOT (day = ANY(completedDays)) THEN array_append(...) ELSE ... END`) to avoid the
read-then-write race. Import `sql` from `drizzle-orm` — it was not in the original import.

**Why:** Two concurrent device completions of different days would both read the same array and
overwrite each other's day. The SQL CASE expression is atomic at DB level.

## Pending invite token pattern (P2-11)
When an unauthenticated user hits `/join/:inviteToken`:
1. `JoinByLink.tsx` detects `!user && !authLoading`, saves token to `sessionStorage('pendingInviteToken')`, shows "Sign in to accept" UI.
2. `Welcome.tsx` — in BOTH routing useEffect branches (fast-path and splash) — checks sessionStorage for pending token immediately after auth resolves, redirects to `/join/<token>` and clears the key.
3. Admin users bypass this check (pendingInviteToken guard: `user.role !== 'admin' && user.role !== 'superAdmin'`).

**Why:** Welcome.tsx routes to /walk after sign-in (spec-locked). Without the sessionStorage bridge, the invite context is lost when the auth flow redirects to the splash/entry route.

## Sermon companion publish atomicity (P2-12)
Added `publishCompanionAtomic(id)` to `sermon-companion-store.ts` — wraps companion header UPDATE + entry bulk-UPDATE in a single PG transaction. The route calls this instead of the two separate store functions.

**Why:** Header could publish while the entry UPDATE fails, leaving a broken reading experience for members.

## Bible overview bulk-publish (P2-9)
Server route: `PATCH /api/bible/chapter-overviews/admin/book-status` (in `bible.ts`, near the study-notes bulk/status route). Takes `{ bookId, status }`, updates all overviews for the book in a single SQL UPDATE (WHERE status IN ('Draft','In Review')).

`BibleProgressDashboard.publishAllInReview()` now calls BOTH the study-notes bulk status endpoint AND this overview endpoint. Previously only notes were updated.

## P2-6 pastoral handoff pattern
`handoffType === 'pastoral'` in AskEmmausConversation sets `isPastoralMode` state.
Renders an amber inline banner ("A gentle note — your pastor would love to walk through this with you") above the follow-up composer. Not full-screen — that is reserved for crisis handoff only. Dismissible via a button.

## P2-8 cloud annotation fire-and-forget — intentional by design
`BibleContext.persist()` fires PATCH to cloud and silently ignores failures. Code comment at line 219 explicitly documents: "PATCH also fails silently and localStorage remains the source of truth." No fix needed — localStorage is authoritative.

## Deferred post-launch items (never resolved during launch pass)
- **P2-7**: Preached Here → YouTube opens in new tab. Requires new member sermon viewer route. UX degradation, not a blocker.
- **P2-13**: `backSource`/`backSourceId` URL params written by JourneyDetail but never read by JourneyDay. Main `source`/`sourceId` chain (used by WalkCompletePage) is intact. Only 3+ level deep back-chains break.
- **SC-2**: StudioJourneyList filters out `journeyType === 'companion'` — admin can't manage companions through UI. Server CRUD/publish routes all exist.
- **DEV-2**: Admin devotionals authoring UI absent — CRUD API exists, no admin page.
- **RM-1**: Core Room features are stubs (notifications, shared reflections, etc.).
