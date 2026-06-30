// src/lib/data/volume-maps.test.ts
import { describe, it, expect } from "vitest";
import { buildVolumeMaps } from "./volume-maps";

describe("buildVolumeMaps", () => {
  it("builds global and per-market maps, skipping nulls", () => {
    const { global, perMarket } = buildVolumeMaps(
      [
        { text: "استرداد", global_volume: 12000 },
        { text: "نصب", global_volume: null },
      ],
      [
        { volume: 8100, keywords: { text: "استرداد" }, countries: { code: "AE" } },
        { volume: null, keywords: { text: "استرداد" }, countries: { code: "SA" } },
      ],
    );
    expect(global.get("استرداد")).toBe(12000);
    expect(global.has("نصب")).toBe(false);
    expect(perMarket.get("استرداد|AE")).toBe(8100);
    expect(perMarket.has("استرداد|SA")).toBe(false);
  });
  it("tolerates embedded relations returned as arrays", () => {
    const { perMarket } = buildVolumeMaps([], [
      { volume: 50, keywords: [{ text: "x" }], countries: [{ code: "OM" }] },
    ]);
    expect(perMarket.get("x|OM")).toBe(50);
  });
});
