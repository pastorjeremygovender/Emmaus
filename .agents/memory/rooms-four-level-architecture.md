---
name: Rooms Four-Level Architecture
description: Step 1 of the four-level Rooms architecture — room_type column, permissions, church_video_settings table, content linking on room creation.
---

## Room Types
Four types implemented in DB (`rooms.room_type TEXT DEFAULT 'personal'`):
- `personal` — any authenticated member, no video
- `ministry` — group_leader or pastor pastoral_role (or admin/superAdmin app role)
- `leadership` — pastor pastoral_role (or admin/superAdmin app role)
- `church_service` — admin/superAdmin app role only (architecture only, no UI yet)

**Why:** Spec requires that ordinary members never access ministry/leadership video rooms; church controls who can create what.

## Permission check
`canCreateRoomType(userId, roomType, appRole)` in `room-store.ts`:
- Checks `user-role-store` (app role) first
- Falls back to `user_profiles.pastoral_role` for group_leader/pastor

The `user-role-store` only knows `user | admin | superAdmin`. Ministry/leadership authority comes from `user_profiles.pastoral_role` = `group_leader` or `pastor`.

## Content linking
`rooms` table has `linked_content_id TEXT` and `linked_content_type TEXT` columns.
`StudyTogetherSheet` passes these to `apiCreateRoom` + `roomType: 'personal'`.
For `journey` contentType it also calls `apiLinkJourney` to register shared progress tracking.
Creator's own personal progress is never touched — room tracks separately via `room_journeys`.

## Video settings
`church_video_settings` table (single-row, id=1):
- `video_enabled` BOOLEAN DEFAULT false
- `max_concurrent_rooms` INT DEFAULT 5
- `max_participants_per_room` INT DEFAULT 20
- `max_duration_minutes` INT DEFAULT 120
- `allowed_roles` TEXT[] DEFAULT ['group_leader','pastor','admin','superAdmin']
Endpoints: `GET /api/rooms/admin/video-settings`, `PATCH /api/rooms/admin/video-settings` (admin only).
Admin UI: Settings → Rooms & Video Settings section.

## Build order
- Step 1 (this session): room types, permissions, content linking, video settings schema ✅
- Step 2 (future): LiveKit integration for Ministry Rooms
- Step 3 (future): Shared Scripture, highlighting, leader controls
- Step 4 (future): Polls, attendance, moderation
- Church Service Rooms: architecture only, no UI

## DO NOT BUILD (per spec)
- Own video engine, synchronized audio/Bible playback, Emmaus Voice in groups, whiteboard, Media Studio integration
