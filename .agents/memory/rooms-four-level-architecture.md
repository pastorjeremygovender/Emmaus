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

## Separate media host authorization
Text Groups are available to authenticated members without media-host permission. Audio and video host permissions are independent account capabilities, and hosting still requires Owner/Leader membership in the specific room. Church Administrators retain both capabilities automatically.

**Why:** Room creators should be able to create and lead ordinary Text Groups without being granted LiveKit access, while the church retains explicit control over who can host audio or video.

**How to apply:** Enforce the capability and room-role checks on every media start/end path; expose only the current user's capability on room detail and manage account permissions from the administrator's pastoral person page. Preserve the legacy authorized-room-leader grant during migration and audit administrator changes.

## Build order
- Step 1: room types, permissions, content linking, video settings schema ✅
- V1 architecture: dual-dimension rooms (contentType + roomType), prayer requests, content panel, leader controls scaffold ✅
- Phase 2 (LiveKit video active): VideoRoom rendered in RoomDetail for ministry/leadership/church_service rooms ✅

## Dual-dimension model (V1)
- `room_type` = permission level: personal | ministry | leadership | church_service
- `content_type` = content category: walk | journey | devotional | bible-study | sermon-companion
- These are independent — any combination is valid (e.g. Walk + Ministry, Bible Study + Leadership)
- `getContentTypeShortLabel()` + `getRoomTypeLabel()` in rooms-types.ts are the canonical helpers

## Room detail layout (V1 order)
Header → Content Panel → Shared Progress → Prayer Requests → Discussion/Chat → Members → Leader Controls scaffold (admin) → Room Actions

## Prayer requests
- Table: room_prayer_requests (id, room_id, user_id, author_name, request, is_answered, created_at)
- Routes: GET/POST /:roomId/prayer, PATCH /:roomId/prayer/:prayerId/answered
- PrayerRequests.tsx component — self-contained with own state; admins can mark as answered

## Leader controls
- Scaffolded (disabled) in UI for admins: Open Scripture, Navigate to today's step, Highlight discussion, Poll, Prayer time, Video
- NOT implemented — architecture placeholder only
- Step 3 (future): Shared Scripture, highlighting, leader controls
- Step 4 (future): Polls, attendance, moderation
- Church Service Rooms: architecture only, no UI

## DO NOT BUILD (per spec)
- Own video engine, synchronized audio/Bible playback, Emmaus Voice in groups, whiteboard, Media Studio integration
