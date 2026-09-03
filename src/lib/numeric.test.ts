import { describe, it, expect } from "vitest";
import { parseDecimalField, parseIntegerField } from "./numeric";

describe("parseDecimalField", () => {
  it("accepts a decimal score", () => {
    expect(parseDecimalField("87.5", "SEO score")).toEqual({ ok: true, value: 87.5 });
  });
  it("accepts a whole number", () => {
    expect(parseDecimalField("92", "SEO score")).toEqual({ ok: true, value: 92 });
  });
  it("treats blank as null rather than zero", () => {
    expect(parseDecimalField("", "SEO score")).toEqual({ ok: true, value: null });
  });
  it("rounds to the 2dp the numeric(5,2) column stores, instead of truncating silently", () => {
    expect(parseDecimalField("87.555", "SEO score")).toEqual({ ok: true, value: 87.56 });
  });
  it("rejects non-numeric text with a labelled error", () => {
    const r = parseDecimalField("abc", "SEO score");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("SEO score must be a number");
  });
  it("enforces an upper bound", () => {
    const r = parseDecimalField("100.5", "SEO score", { min: 0, max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("SEO score must be between 0 and 100");
  });
  it("enforces a lower bound", () => {
    expect(parseDecimalField("-0.5", "SEO score", { min: 0, max: 100 }).ok).toBe(false);
  });
  it("accepts the bounds themselves", () => {
    expect(parseDecimalField("0", "s", { min: 0, max: 100 })).toEqual({ ok: true, value: 0 });
    expect(parseDecimalField("100", "s", { min: 0, max: 100 })).toEqual({ ok: true, value: 100 });
  });
  it("normalizes Arabic-Indic digits and the Arabic decimal separator", () => {
    // This dashboard is Arabic-first; a pasted ٨٧٫٥ should not read as invalid.
    expect(parseDecimalField("\u0668\u0667\u066B\u0665", "SEO score")).toEqual({ ok: true, value: 87.5 });
  });
  it("rejects a lone separator", () => {
    expect(parseDecimalField(".", "SEO score").ok).toBe(false);
  });
});

describe("parseIntegerField", () => {
  it("accepts a whole number", () => {
    expect(parseIntegerField("14", "Warnings")).toEqual({ ok: true, value: 14 });
  });
  it("refuses a decimal instead of silently truncating it", () => {
    // parseInt("12.7") used to yield 12 with no complaint.
    const r = parseIntegerField("12.7", "Warnings");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Warnings must be a whole number");
  });
  it("treats blank as null", () => {
    expect(parseIntegerField("", "Warnings")).toEqual({ ok: true, value: null });
  });
  it("accepts a negative integer", () => {
    expect(parseIntegerField("-3", "Sort order")).toEqual({ ok: true, value: -3 });
  });
});
