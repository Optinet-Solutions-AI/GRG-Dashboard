import { describe, it, expect } from "vitest";
import { formatVolume } from "./format";

describe("formatVolume", () => {
  it("adds thousands separators", () => {
    expect(formatVolume(12000)).toBe("12,000");
    expect(formatVolume(8100)).toBe("8,100");
  });
  it("renders zero as 0, not a dash", () => {
    expect(formatVolume(0)).toBe("0");
  });
  it("renders null and undefined as an em dash", () => {
    expect(formatVolume(null)).toBe("—");
    expect(formatVolume(undefined)).toBe("—");
  });
});
