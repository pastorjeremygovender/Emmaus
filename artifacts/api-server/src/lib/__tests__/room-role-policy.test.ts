import test from "node:test";
import assert from "node:assert/strict";
import {
  canHostWithRoomRole,
  isRoomLeaderRole,
  isRoomOwnerRole,
  resolveMediaHostAccess,
} from "../room-store.ts";

test("room leadership is scoped to Owner and Leader membership roles", () => {
  assert.equal(isRoomLeaderRole("owner"), true);
  assert.equal(isRoomLeaderRole("leader"), true);
  assert.equal(isRoomLeaderRole("member"), false);
  assert.equal(isRoomLeaderRole("superAdmin"), false);
  assert.equal(isRoomLeaderRole("pastor"), false);
});

test("global application roles do not grant LiveKit host permission", () => {
  assert.equal(canHostWithRoomRole("owner"), true);
  assert.equal(canHostWithRoomRole("leader"), true);
  assert.equal(canHostWithRoomRole("member"), false);
  assert.equal(canHostWithRoomRole("superAdmin"), false);
});

test("legacy room admin remains readable as the Owner during migration", () => {
  assert.equal(isRoomOwnerRole("admin"), true);
  assert.equal(isRoomLeaderRole("admin"), true);
  assert.equal(canHostWithRoomRole("admin"), true);
});

test("ordinary authenticated users can use Text Groups without media host access", () => {
  const access = resolveMediaHostAccess("user", false, false);
  assert.deepEqual(
    { audio: access.audio, video: access.video, isAdministrator: access.isAdministrator },
    { audio: false, video: false, isAdministrator: false },
  );
});

test("audio and video host permissions are independent", () => {
  const audioOnly = resolveMediaHostAccess("user", true, false);
  const videoOnly = resolveMediaHostAccess("user", false, true);
  assert.equal(audioOnly.audio, true);
  assert.equal(audioOnly.video, false);
  assert.equal(videoOnly.audio, false);
  assert.equal(videoOnly.video, true);
});

test("Church Administrators automatically retain both media permissions", () => {
  for (const role of ["admin", "superAdmin"]) {
    const access = resolveMediaHostAccess(role, false, false);
    assert.equal(access.audio, true);
    assert.equal(access.video, true);
    assert.equal(access.audioSource, "admin_role");
    assert.equal(access.videoSource, "admin_role");
    assert.equal(access.isAdministrator, true);
  }
});

test("room membership leadership remains a separate host requirement", () => {
  const audioOnly = resolveMediaHostAccess("user", true, false);
  assert.equal(audioOnly.audio, true);
  assert.equal(canHostWithRoomRole("member"), false);
  assert.equal(canHostWithRoomRole("owner"), true);
});