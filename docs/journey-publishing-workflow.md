# Journey Publishing Workflow

Journeys move through a defined set of statuses before reaching users.

---

## Status Lifecycle

```
Draft → Pastoral Review → Approved → Published
  ↓                                      ↓
Archived ←─────────────────────────── Archived
```

### Draft
- Created by any content editor.
- Not visible to users.
- Can be freely edited.

### Pastoral Review
- Submitted for pastoral sign-off.
- Still not visible to users.
- The "Submit for Review" button in the admin editor advances to this status.

### Approved
- Signed off by a pastor or admin.
- Still not visible to users.
- Required before publishing.

### Published
- Visible to all users in the Next Steps catalogue.
- `published_at` timestamp is set on first publish.
- Editing a published journey updates it immediately — no re-approval required for minor edits.

### Archived
- Hidden from users.
- Data is preserved (not deleted).
- Can be reached from any status.

---

## Publish Flow (API)

```
POST /api/journeys/:id/publish
```

Sets `status = "Published"` and stamps `published_at` if not already set.

Pre-publish validation is enforced client-side in `JourneyEditor.tsx`:
- Title must not be empty
- At least one step must exist
- Each step must have: scripture, devotional, prayer prompt, action step
- Companion journeys must have a linked sermon ID

---

## Archive / Delete

```
POST /api/journeys/:id/archive   → sets status = "Archived"
DELETE /api/journeys/:id         → removes record (cascades steps + progress)
```

Deleting is permanent and removes all associated steps, progress records, and reflections. Archive is preferred when active users have journey progress.

---

## Admin UI Sequence

1. Click **New Journey** in the Journey Library.
2. Fill in title, description, type, and metadata → **Save Draft**.
3. Add steps via **Add Day** → fill content in the Day Editor.
4. Click **Submit for Review** when ready for pastoral oversight.
5. A pastor clicks **Approve** after reviewing.
6. Admin clicks **Publish** → confirms the publish dialog → journey goes live.
