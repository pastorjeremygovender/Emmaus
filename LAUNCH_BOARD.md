# Emmaus Launch Board — 13 August 2026

> **Mode:** Launch-only. No new features. No redesigns. No refactors.
> Fix launch blockers only. Branch: `launch-13-august`.

---

## Pillars & Status

| # | Pillar | Completion | Status |
|---|--------|-----------|--------|
| 1 | Daily Rhythm | 95% | 🟡 Issues |
| 2 | Daily Devotionals | 75% | 🟠 P1 gap (no admin UI) |
| 3 | Walks & Journeys | 90% | 🟡 Issues |
| 4 | Bible Studies | 80% | 🟡 Issues |
| 5 | Bible | 80% | 🟡 Issues |
| 6 | Rooms | 70% | 🟠 P1 gap (stubs) |
| 7 | Ask Emmaus | 90% | 🟡 Issues |
| 8 | Sermon Companions | 70% | 🔴 P0 gap (no admin UI) |

**Status key:** 🔴 Has P0 blocker · 🟠 Has P1 blocker · 🟡 P2 issues only · ✅ Clear

---

## Launch Blockers

### 🔴 P0 — Hard Blockers
> Must fix before any member sees the app.

---

#### 1 · Daily Rhythm

- [x] **DR-1 · Hard-coded journey ID** _(fixed 31 Jul 2026)_
  `DailyRhythmDay.tsx` hardcoded `15-minutes-with-jesus`. Fixed to dynamically look up `journeyType === 'daily-rhythm'`.
  _Files:_ `pages/DailyRhythmDay.tsx`

- [x] **DR-2 · Progress API accepts caller-supplied userId** _(fixed 31 Jul 2026)_
  `routes/journeys.ts` fell back to `userId` in query/body. Fixed: body/query fallbacks removed; only signed cookie or X-User-Id header (dev gate) accepted.
  _Files:_ `api-server/src/routes/journeys.ts`

---

#### 2 · Daily Devotionals

- [x] **DEV-1 · Header-based admin auth (security)** _(fixed 31 Jul 2026)_
  `routes/devotionals.ts` trusted X-User-Role with no NODE_ENV gate. Fixed by adding `if (process.env.NODE_ENV === "production") return false;` to `isAdminRole()`, mirroring `auth.ts`.
  _Files:_ `api-server/src/routes/devotionals.ts`

---

#### 4 · Bible Studies

- [x] **BS-1 · Generated content invisible to members** _(fixed 31 Jul 2026)_
  `VerseStudyPanel.tsx` and `ChapterReader.tsx` called static path-style routes. Fixed to call query-param DB routes (`?bookId=&chapter=`).
  _Files:_ `components/VerseStudyPanel.tsx`, `pages/bible/ChapterReader.tsx`

- [x] **BS-2 · ChapterOverview type mismatch** _(fixed 31 Jul 2026)_
  DB snake_case columns mapped to camelCase shape in ChapterReader fetch chain.
  _Files:_ `pages/bible/ChapterReader.tsx`

---

#### 8 · Sermon Companions

- [x] **SC-0 · Current-week companion invisible to new members** _(fixed 31 Jul 2026)_
  Walk.tsx filtered out companions with no progress. Fixed with `unstartedCurrentWeekCompanion` state + discovery card + `handleBeginCompanion`.
  _Files:_ `pages/Walk.tsx`

- [x] **SC-1 · Timestamp links generated but never rendered** _(fixed 31 Jul 2026)_
  Added `sermonLink?: string | null` to `SCEntry` interface. Added `ExternalLink` import. Renders "Listen to this sermon moment" link above `DevotionalReading` when `entry.sermonLink` is non-empty.
  _Files:_ `pages/SermonCompanionReader.tsx`

- [x] **SC-3 · Generation confirmation flow has no UI** _(verified: already implemented)_
  `SermonEditor.tsx` already handles `SERMON_CONFIRMATION_REQUIRED` → `setPhase('confirm-sermon')`. `ConfirmSermonPhase` component exists at line 590. Not a blocker.

- [ ] **SC-2 · Admin has no companion management UI** _(deferred — 1–2 days)_
  Content Studio filters out `journeyType === 'companion'` at `StudioJourneyList.tsx:74`. Full CRUD/publish routes exist server-side but are unreachable from the admin shell.
  _Files:_ `pages/admin/content-studio/StudioJourneyList.tsx`, `api-server/src/routes/sermon-companions.ts`
  _Effort:_ 1–2 days

---

### 🟠 P1 — Major Functional Gaps
> Launch is significantly degraded without these.

---

#### 3 · Walks & Journeys

- [x] **WJ-0 · No published growth walk in DB** _(fixed 31 Jul 2026)_
  Seeded "The Road to Emmaus" (3 published days, Luke 24) via `scripts/seed-walk.mjs`.

- [x] **WJ-1 · Completion drops return context** _(fixed 31 Jul 2026)_
  `WalkCompletePage` now reads `source`/`sourceId` from URL and calls `resolveReturn()` so the back button honours the member's actual entry point (Walk, Bible, Journey Detail, etc.).
  _Files:_ `pages/WalkCompletePage.tsx`

- [ ] **WJ-2 · Back-navigation naming collision** _(downgraded to P2 — not an active collision)_
  Investigation found: `backSource`/`backSourceId` are written by JourneyDetail but never read by JourneyDay — dead params, not an active collision. `from` is isolated to PreviousDays pages (coherent subsystem). Main `source`/`sourceId` chain is consistent throughout the tree. Reclassified as P2.

---

#### 2 · Daily Devotionals _(continued)_

- [ ] **DEV-2 · No admin authoring UI** _(deferred — 1–2 days)_
  Full CRUD API exists but no admin page to create/edit series. Admins must use raw API calls.
  _Files:_ `src/pages/admin/` (absent), `lib/devotionals-api.ts`
  _Effort:_ 1–2 days

---

#### 7 · Ask Emmaus

- [x] **AE-1 · Memory saved but never loaded** _(fixed 31 Jul 2026)_
  `getMemories(userId)` now fetched in parallel with Bible/sermon search in `conversation-service.ts`. Approved memories injected into `contextBlock` in the same format as `context-builder.ts` lines 114–119.
  _Files:_ `api-server/src/emmaus/conversation-service.ts`

- [x] **AE-2 · Follow-up prompts never shown** _(fixed 31 Jul 2026)_
  `followUpPrompts` from AI response metadata now render as tappable suggestion chips after the last assistant message. Tapping populates the follow-up composer input.
  _Files:_ `pages/personal/AskEmmausConversation.tsx`

---

#### 6 · Rooms

- [x] **RM-0 · Rooms MVP — all five core requirements** _(fixed 31 Jul 2026)_
  Create room, invite code, join by code, link walk, per-member progress grid — all working. E2E verified with two synthetic users.
  _Files:_ `pages/rooms/RoomDetail.tsx`

- [x] **RM-2 · `startSharedJourney` uses non-atomic endpoint** _(fixed 31 Jul 2026)_
  `RoomsContext.startSharedJourney` now calls `apiStartShared()` (atomic `/api/rooms/start-shared`) instead of `apiLinkJourney()`.
  _Files:_ `contexts/RoomsContext.tsx`

- [ ] **RM-1 · Core Room features are stubs** _(deferred — 3–5 days)_
  Notifications, journey invitations, participant tracking, shared reflections, posts, admin archive/revoke are all no-ops. Too large for launch window; recommend post-launch.
  _Files:_ `contexts/RoomsContext.tsx`, `api-server/src/routes/rooms.ts`
  _Effort:_ 3–5 days

---

### 🟡 P2 — Quality Issues
> Degrade experience. Fix before broad rollout.

| ID | Pillar | Issue | Files | Effort | Status |
|----|--------|-------|-------|--------|--------|
| P2-1 | Rooms | Chat header shows "Room Chat" not room name | `pages/rooms/RoomDetail.tsx:130–132`, `RoomChat.tsx:83–87` | 30 min | ✅ 31 Jul |
| P2-2 | Devotionals | `markDayComplete` race condition — read-then-write on `completedDays` JSONB | `api-server/src/lib/devotional-store.ts:268–287` | 1–2 hrs | ☐ |
| P2-3 | Daily Rhythm | Silent completion sync failure — `completeStep` swallows API errors | `contexts/JourneyContext.tsx:303–306` | 2–4 hrs | ☐ |
| P2-4 | Sermon Companions | Status casing mismatch — generation returns `"draft"`; DB/store use `"Draft"` | `api-server/src/routes/sermon-generator.ts:106–110` | 30 min | ✅ 31 Jul |
| P2-5 | Ask Emmaus | History omits practical nextSteps — past conversations lose actionable cards | `pages/personal/AskEmmausHistory.tsx:94–105` | 1–2 hrs | ✅ 31 Jul |
| P2-6 | Ask Emmaus | Pastoral handoff has no UI — server sets `handoffType: pastoral` but client renders no banner | `pages/personal/AskEmmausConversation.tsx:258–261` | 2 hrs | ✅ 31 Jul |
| P2-7 | Bible | Preached Here links open YouTube directly — no in-app sermon route | `data/sermon-verse-links.ts`, `components/emmaus/ResourceCard.tsx:65–70` | 4–8 hrs | ☐ |
| P2-8 | Bible | Cloud annotation PATCH is fire-and-forget — save failures are silent | `contexts/BibleContext.tsx:162–179` | 4 hrs | ☐ |
| P2-9 | Bible Studies | `publishAllInReview` only updated study notes, not chapter overviews | `pages/admin/content-studio/BibleProgressDashboard.tsx:102–125` | 1 hr | ✅ 31 Jul |
| P2-10 | Daily Rhythm | `isCompletedToday` timezone brittleness — `toLocaleDateString()` without locale | `lib/daily-lock.ts:17–25` | 1 hr | ✅ 31 Jul |
| P2-11 | Rooms | Unauthenticated users cannot join via invite link | `pages/rooms/JoinByLink.tsx:20–36` | 1 day | ☐ |
| P2-12 | Sermon Companions | Non-atomic publish — two independent store calls; header can publish while entry update fails | `api-server/src/routes/sermon-companions.ts:287–295` | 1–2 hrs | ✅ 31 Jul |
| P2-13 | Walks & Journeys | `backSource`/`backSourceId` written by JourneyDetail but never read — deep back-chain lost at 3+ levels | `pages/journeys/JourneyDetail.tsx:47`, `lib/return-context.ts` | 1 day | ☐ |

---

## Effort Summary

| Priority | Count | Estimated Total | Done |
|----------|-------|----------------|------|
| P0 — Hard blockers | 9 items | — | 8 done, 1 deferred (SC-2) |
| P1 — Major gaps | 8 items | — | 6 done, 2 deferred (DEV-2, RM-1) |
| P2 — Quality issues | 13 items | 3–5 days | 7 done (P2-1,4,5,6,9,10,12) |

---

## Deferred Items (post-launch)

- **SC-2** — Admin companion management UI (Content Studio doesn't surface companions)
- **DEV-2** — Admin devotionals authoring UI
- **RM-1** — Core Room feature stubs (notifications, shared reflections, participant tracking)

---

## Frozen Scope

Everything outside the eight pillars listed above is frozen for this release.
No new features, no UI redesigns, no refactors of working code.

_Last updated: 31 July 2026 — session 2_
