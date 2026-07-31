// ─── Emmaus Rooms — demo user references ───────────────────────────────────
// Only DEMO_USER_2 is still referenced by legacy pages (discussion, shared journey).
// All demo Room/Invite/Post data is no longer used — Rooms are now backed by the live API.

export const DEMO_USER_2 = {
  id: 'demo-user-2',
  email: 'friend@emmaus.church',
  preferredName: 'Sarah',
  role: 'user' as const,
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  currentFeeling: null,
  feelingUpdatedAt: null,
};
