# Journey Permissions

## Current Implementation

Journey access is differentiated by user role. The role is read from `user.role` in `AuthContext`.

### Admin (`role: "admin"`)
- `GET /api/journeys` returns **all** journeys (all statuses).
- Can create, edit, publish, archive, and delete any journey.
- Can manage steps for any journey.

### Regular User (`role: "user"`)
- `GET /api/journeys/published` returns only **Published** journeys.
- Can start journeys and track their own progress.
- Cannot create or edit journeys.

## Client-Side Enforcement

The `JourneyContext` automatically uses the correct API endpoint based on user role:

```typescript
const jList = user?.role === 'admin'
  ? await api.listJourneys()       // all statuses
  : await api.listPublishedJourneys();  // Published only
```

Draft, Pastoral Review, Approved, and Archived journeys are never returned to non-admin users.

## Server-Side Enforcement

Currently, the admin CRUD routes (`POST /api/journeys`, `PATCH /api/journeys/:id`, `DELETE /api/journeys/:id`) do not enforce authentication middleware. The frontend admin UI is protected by route guards (`/admin` path requires `role: "admin"`).

A future task should add server-side auth middleware to the admin routes, using the session cookie set during login.

## Role Matrix

| Action | Admin | User |
|---|---|---|
| List published journeys | ✅ | ✅ |
| List all journeys (any status) | ✅ | ❌ |
| Create journey | ✅ | ❌ |
| Edit journey metadata | ✅ | ❌ |
| Publish journey | ✅ | ❌ |
| Archive journey | ✅ | ❌ |
| Delete journey | ✅ | ❌ |
| Add / edit / delete steps | ✅ | ❌ |
| Start journey (own progress) | ✅ | ✅ |
| Complete step (own progress) | ✅ | ✅ |
| Read own reflections | ✅ | ✅ |
