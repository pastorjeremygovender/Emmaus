---
name: Emmaus Rooms feature
description: Architecture decisions and demo-mode constraints for the Emmaus Rooms shared-journey feature.
---

## Core principle
Private by default. Shared by choice. A Room never exposes private reflections, prayers, Bible notes, or personal journeys unless the user explicitly shares.

## Key architecture decisions

**State storage:** All Room state in localStorage via `RoomsContext`. Keys: `emmaus_rooms`, `emmaus_room_members`, `emmaus_room_invites`, `emmaus_room_journey_invitations`, `emmaus_room_journey_participants`, `emmaus_room_posts`, `emmaus_shared_reflections`, `emmaus_room_notifications`.

**Stale-closure pattern:** All mutations that read state before writing use React functional state updates (`setState(prev => ...)`) rather than calling direct save helpers — same pattern as the MediaStudio `addAssets` fix.

**Second demo user:** `demo-user-2` (Sarah, `friend@emmaus.church`) added to AuthContext. Demo room "Govender Family" (`room-demo-1`) seeds with both users as members.

**Why:** Allows local demo validation of the full join/invite/shared-journey flow without Firebase.

**Journey start modal:** Only shown for first-time starts (`alreadyStarted = false`). "Continue Journey" navigates directly, bypassing the modal. The modal is a bottom sheet rendered over the Journeys page.

**Reflection sharing:** After `completeStep`, if the user wrote a reflection AND is in a Room doing that journey, a share prompt screen appears before the final "Great job" screen. Default is never-shared; user must explicitly opt in. `SharedReflection.revokedAt` tracks revocation.

**Access codes + tokens:** Generated client-side with random characters (not cryptographically secure). In production, these must be server-generated and validated server-side.

## Routes added
- `/rooms` — Rooms hub (My Rooms, notifications, create/join)
- `/rooms/create` — Create Room form
- `/rooms/join` — Join by access code
- `/rooms/:roomId` — Room detail
- `/rooms/:roomId/invite` — Invite Members + QR
- `/rooms/:roomId/settings` — Room settings (Owner only)
- `/rooms/:roomId/journey/:journeyId/view` — Shared journey progress
- `/rooms/:roomId/journey/:journeyId/day/:day/discussion` — Day discussion
- `/join-room/:inviteToken` — Invite link landing page

## Display name resolution (demo mode)
`DEMO_NAMES` map in each room page: `demo-user-1 → "Friend"`, `demo-user-2 → "Sarah"`, `demo-admin-1 → "Jeremy"`. In production, replace with Firestore users collection lookup.

## Firebase work still required
- Server-side access code / token generation
- Firestore security rules: only Room members can read room data
- Firebase Custom Claims for role enforcement
- Server-side invite expiry validation
- Real-time updates for Room posts and notifications
- User display name lookup from Firestore

## Admin Rooms section
Added as a new `rooms` nav item in Admin.tsx. `AdminRooms.tsx` shows all rooms, members, invitations, and posts. Admin can archive rooms, revoke invitations, and remove posts. Admin cannot silently join Rooms or access private content.
