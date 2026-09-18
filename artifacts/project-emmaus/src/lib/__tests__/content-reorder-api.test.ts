import { describe, expect, it } from "vitest";
import { moveVisibleOrder } from "../content-reorder-api";

describe("moveVisibleOrder", () => {
  it("moves one filtered item one visible position without moving hidden items", () => {
    expect(moveVisibleOrder(
      ["a", "hidden", "b", "c"],
      ["a", "b", "c"],
      "c",
      -1,
    )).toEqual(["a", "hidden", "c", "b"]);
  });

  it("keeps the complete list deterministic when a visible item moves across a hidden slot", () => {
    expect(moveVisibleOrder(
      ["a", "hidden", "b", "c"],
      ["a", "b", "c"],
      "b",
      -1,
    )).toEqual(["b", "hidden", "a", "c"]);
  });

  it("does not move beyond the first or last visible position", () => {
    const ids = ["a", "hidden", "b"];
    expect(moveVisibleOrder(ids, ["a", "b"], "a", -1)).toEqual(ids);
    expect(moveVisibleOrder(ids, ["a", "b"], "b", 1)).toEqual(ids);
  });

  it("returns a fresh order for a valid one-position move", () => {
    const ids = ["a", "b", "c"];
    const next = moveVisibleOrder(ids, ids, "b", 1);
    expect(next).toEqual(["a", "c", "b"]);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});