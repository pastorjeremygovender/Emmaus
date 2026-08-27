import test from "node:test";
import assert from "node:assert/strict";
import {
  canHostWithRoomRole,
  isRoomLeaderRole,
  isRoomOwnerRole,
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