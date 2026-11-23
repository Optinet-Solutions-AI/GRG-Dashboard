import { describe, it, expect } from "vitest";
import { keywordsTrackedBySomeSite } from "./tracked-keywords";

/**
 * The volume editor listed every row of the shared keywords table — 410 of them on
 * 2026-11-23, of which only 85 were tracked by any site. After Ahrefs became the source of
 * the keyword set, the other 325 are leftovers from old CSV imports: they appear on no
 * grid and are measured by nothing, so typing a search volume against one is wasted work.
 */
const kw = (id: string, text: string) => ({ id, text });

describe("keywordsTrackedBySomeSite", () => {
  const keywords = [kw("1", "تجميد حساب التداول"), kw("2", "شكوى ضد شركة تداول"), kw("3", "gulf recovery group")];

  it("keeps a keyword some site tracks", () => {
    const kept = keywordsTrackedBySomeSite(keywords, [{ keyword_id: "1" }, { keyword_id: "3" }]);
    expect(kept.map((k) => k.id)).toEqual(["1", "3"]);
  });

  it("drops a keyword no site tracks", () => {
    const kept = keywordsTrackedBySomeSite(keywords, [{ keyword_id: "1" }]);
    expect(kept.map((k) => k.text)).not.toContain("شكوى ضد شركة تداول");
  });

  it("counts a keyword once however many markets list it", () => {
    const kept = keywordsTrackedBySomeSite(keywords, [{ keyword_id: "2" }, { keyword_id: "2" }, { keyword_id: "2" }]);
    expect(kept.map((k) => k.id)).toEqual(["2"]);
  });

  // The guard: a failed or empty read of the sheet must not blank the editor, exactly as a
  // thin Ahrefs reply must not empty a site's grid.
  it("shows everything when the sheet could not be read", () => {
    expect(keywordsTrackedBySomeSite(keywords, [])).toEqual(keywords);
    expect(keywordsTrackedBySomeSite(keywords, null)).toEqual(keywords);
  });
});
