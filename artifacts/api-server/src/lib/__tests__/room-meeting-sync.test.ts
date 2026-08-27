import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const storeSource = readFileSync(resolve(here, "../room-store.ts"), "utf8");
const routesSource = readFileSync(resolve(here, "../../routes/rooms.ts"), "utf8");

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