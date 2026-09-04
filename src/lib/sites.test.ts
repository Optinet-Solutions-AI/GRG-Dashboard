import { describe, it, expect } from "vitest";
import { resolveSiteId } from "./sites";

const sites = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("resolveSiteId", () => {
  it("returns the requested site when it exists", () => {
    expect(resolveSiteId(sites, "b")).toBe("b");
  });
  it("falls back to the first site when no site is requested", () => {
    // There is no "all sites" view: an unscoped URL shows the first site.
    expect(resolveSiteId(sites, undefined)).toBe("a");
    expect(resolveSiteId(sites, "")).toBe("a");
  });
  it("falls back to the first site when the requested id is unknown", () => {
    expect(resolveSiteId(sites, "nope")).toBe("a");
  });
  it("returns null when there are no sites at all", () => {
    expect(resolveSiteId([], "b")).toBeNull();
    expect(resolveSiteId(null, "b")).toBeNull();
    expect(resolveSiteId(undefined, undefined)).toBeNull();
  });
});
