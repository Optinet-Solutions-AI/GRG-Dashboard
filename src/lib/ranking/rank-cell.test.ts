import { describe, it, expect } from "vitest";
import { rankCell } from "./rank-cell.mjs";

describe("rankCell", () => {
  it("green + up arrow when improved into top 10", () => {
    expect(rankCell(8, 12)).toEqual({ label: "8", color: "green", dir: "up", delta: 4 });
  });
  it("amber + down arrow when dropped", () => {
    expect(rankCell(21, 17)).toEqual({ label: "21", color: "amber", dir: "down", delta: 4 });
  });
  it("red dash when not in top 100, with 'down' if it had a prior position", () => {
    expect(rankCell(null, 17)).toEqual({ label: "—", color: "red", dir: "down", delta: null });
  });
  it("amber NEW when newly ranked with no prior", () => {
    expect(rankCell(15, null)).toEqual({ label: "15", color: "amber", dir: "new", delta: null });
  });
  it("green NEW into top 10", () => {
    expect(rankCell(5, null)).toEqual({ label: "5", color: "green", dir: "new", delta: null });
  });
  it("no movement when unchanged", () => {
    expect(rankCell(5, 5)).toEqual({ label: "5", color: "green", dir: "none", delta: null });
  });
  it("red none when never ranked", () => {
    expect(rankCell(null, null)).toEqual({ label: "—", color: "red", dir: "none", delta: null });
  });
});
