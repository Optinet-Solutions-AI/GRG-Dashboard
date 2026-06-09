import { describe, it, expect } from "vitest";
import { rankCell } from "./rank-cell.mjs";

describe("rankCell", () => {
  it("improved -> up arrow with previous position", () => {
    expect(rankCell(8, 12)).toEqual({ label: "8", ranked: true, dir: "up", prev: 12 });
  });
  it("dropped -> down arrow with previous position", () => {
    expect(rankCell(21, 17)).toEqual({ label: "21", ranked: true, dir: "down", prev: 17 });
  });
  it("dropped out of top 100 -> muted, no arrow", () => {
    expect(rankCell(null, 17)).toEqual({ label: "Not in top 100", ranked: false, dir: "none", prev: null });
  });
  it("newly ranked (no prior) -> new", () => {
    expect(rankCell(15, null)).toEqual({ label: "15", ranked: true, dir: "new", prev: null });
  });
  it("unchanged -> no arrow, no parens", () => {
    expect(rankCell(5, 5)).toEqual({ label: "5", ranked: true, dir: "none", prev: null });
  });
  it("never ranked -> muted", () => {
    expect(rankCell(null, null)).toEqual({ label: "Not in top 100", ranked: false, dir: "none", prev: null });
  });
});
