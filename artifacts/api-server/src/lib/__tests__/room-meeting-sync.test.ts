import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const storeSource = readFileSync(resolve(here, "../room-store.ts"), "utf8");
const routesSource = readFileSync(resolve(here, "../../routes/rooms.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../../app.ts"), "utf8");

test("explicit attendance joins return a row scoped to the exact active session", () => {
  assert.match(storeSource, /WHERE id = \$1::uuid AND room_id = \$2 AND status = 'active'/);
  assert.match(storeSource, /ON CONFLICT \(session_id, user_id\) DO UPDATE SET left_at = NULL\s+RETURNING \*/);
});

test("Group Discussion requires current-session attendance while a meeting is active", () => {
  assert.match(routesSource, /async function canAccessRoomDiscussion/);
  assert.match(routesSource, /session_id = \$1/);
  assert.match(routesSource, /room_id = \$2/);
  assert.match(routesSource, /user_id = \$3/);
  assert.match(routesSource, /AND left_at IS NULL/);
  assert.match(routesSource, /Join the active meeting before opening Group Discussion/);
});

test("Live Meetings settings route is registered before the generic admin room route", () => {
  const settingsRoute = routesSource.indexOf('router.get("/admin/video-settings"');
  const genericRoomRoute = routesSource.indexOf('router.get("/admin/:roomId"');
  assert.notEqual(settingsRoute, -1);
  assert.notEqual(genericRoomRoute, -1);
  assert.ok(settingsRoute < genericRoomRoute);
});

test("API restart recovery turns an in-flight shared Emmaus request into a retryable failure", () => {
  assert.match(storeSource, /recoverInterruptedSharedEmmausRequests/);
  assert.match(storeSource, /status = 'active'/);
  assert.match(storeSource, /activeEmmaus.*status.*generating/s);
  assert.match(storeSource, /interrupted when Emmaus restarted/);
  assert.match(appSource, /recoverInterruptedSharedEmmausRequests/);
});

test("shared Emmaus retries claim the session atomically and reject overlapping generations", () => {
  assert.match(storeSource, /claimSharedEmmausRequest/);
  assert.match(storeSource, /FOR UPDATE/);
  assert.match(storeSource, /EMMAUS_REQUEST_ACTIVE/);
  assert.match(routesSource, /claimSharedEmmausRequest/);
  assert.match(routesSource, /status\(409\)/);
});

test("LiveKit meeting tokens allow participants to publish raise-hand attributes", () => {
  assert.match(routesSource, /canUpdateOwnMetadata:\s*true/);
});

test("shared panel assignments are session-scoped, explicit, and monotonically versioned", () => {
  assert.match(storeSource, /export type SharedPanel =/);
  assert.match(storeSource, /SELECT \* FROM room_sessions[\s\S]*room_id = \$1 AND status = 'active'[\s\S]*FOR UPDATE/);
  assert.match(storeSource, /expectedVersion !== current\.version/);
  assert.match(storeSource, /version: current\.version \+ 1/);
  assert.match(storeSource, /status: "stale"/);
});

test("late session-event hydration includes the authoritative shared panel", () => {
  assert.match(routesSource, /sharedPanel: getSharedPanelState\(activeSessionOnConnect\)/);
  assert.match(routesSource, /type: "shared_panel"/);
});

test("room members can request bounded chat attachment URLs without presentation authority", () => {
  const uploadRoute = routesSource.slice(
    routesSource.indexOf('router.post("/:roomId/messages/upload-url"'),
    routesSource.indexOf('// ─── Chat — list media', routesSource.indexOf('router.post("/:roomId/messages/upload-url"')),
  );
  assert.match(uploadRoute, /getMemberRole\(String\(roomId\), userId\)/);
  assert.doesNotMatch(uploadRoute, /guardLeader/);
  assert.match(uploadRoute, /Number\.isSafeInteger\(size\)/);
  assert.match(uploadRoute, /getObjectEntityUploadURL\(`room-media\/\$\{String\(roomId\)\}`\)/);
});

test("removing a currently presented message atomically clears the versioned panel", () => {
  assert.match(storeSource, /DELETE FROM room_media_presentations[\s\S]*message_id = \$2[\s\S]*RETURNING id/);
  assert.match(storeSource, /'panel', 'none'/);
  assert.match(storeSource, /COALESCE\(\(metadata->'sharedPanel'->>'version'\)::integer, 0\) \+ 1/);
});

test("Room attachment serving requires current membership without changing unrelated storage", () => {
  const storageSource = readFileSync(resolve(here, "../../routes/storage.ts"), "utf8");
  assert.match(storageSource, /canAccessRoomMediaObject/);
  assert.match(storageSource, /roomScopedPrefix \|\| probe !== null/);
  assert.match(storageSource, /requireAuth\(req, res\)/);
  assert.match(storageSource, /allowed !== true/);
  assert.match(storeSource, /canReuseLegacyRoomAttachment/);
});