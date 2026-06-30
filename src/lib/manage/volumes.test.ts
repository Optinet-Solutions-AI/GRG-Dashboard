import { describe, it, expect } from "vitest";
import { parseVolumeForm } from "./volumes";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("parseVolumeForm", () => {
  it("parses GSV and per-country SV", () => {
    const out = parseVolumeForm(fd({ "g:kw1": "12000", "v:kw1:cAE": "8100" }));
    expect(out.errors).toEqual([]);
    expect(out.globals).toEqual([{ keyword_id: "kw1", volume: 12000 }]);
    expect(out.cells).toEqual([{ keyword_id: "kw1", country_id: "cAE", volume: 8100 }]);
  });
  it("treats empty input as null (cleared)", () => {
    const out = parseVolumeForm(fd({ "g:kw1": "", "v:kw1:cAE": "  " }));
    expect(out.errors).toEqual([]);
    expect(out.globals).toEqual([{ keyword_id: "kw1", volume: null }]);
    expect(out.cells).toEqual([{ keyword_id: "kw1", country_id: "cAE", volume: null }]);
  });
  it("rejects non-numeric and negative values", () => {
    const out = parseVolumeForm(fd({ "g:kw1": "abc", "v:kw1:cAE": "-5" }));
    expect(out.errors.length).toBe(2);
  });
  it("ignores unrelated form fields", () => {
    const out = parseVolumeForm(fd({ other: "x", "g:kw1": "10" }));
    expect(out.globals).toEqual([{ keyword_id: "kw1", volume: 10 }]);
    expect(out.cells).toEqual([]);
  });
});
