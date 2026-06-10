import { describe, it, expect } from "vitest";
import { normalize, tokenize, stem, levenshtein, fuzzyEq } from "./text";

describe("text utils", () => {
  it("normalizes and tokenizes", () => {
    expect(tokenize("What pages are NOT index?")).toEqual(["what", "pages", "are", "not", "index"]);
    expect(normalize("a, b.")).toBe(" a b ");
  });

  it("stems plural/verb variants to a shared stem", () => {
    expect(stem("indexed")).toBe("index");
    expect(stem("indexing")).toBe("index");
    expect(stem("index")).toBe("index");
    expect(stem("rankings")).toBe("rank");
    expect(stem("ranking")).toBe("rank");
    expect(stem("pages")).toBe("page");
    expect(stem("backlinks")).toBe("backlink");
    expect(stem("issues")).toBe("issue");
    expect(stem("images")).toBe("image");
  });

  it("leaves short words and Arabic untouched", () => {
    expect(stem("is")).toBe("is");
    expect(stem("seo")).toBe("seo");
    expect(stem("التداول")).toBe("التداول");
  });

  it("levenshtein counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("backlink", "baklink")).toBe(1);
  });

  it("fuzzyEq matches typos on long words but not short ones", () => {
    expect(fuzzyEq("pagespeed", "pagepseed")).toBe(true); // transposition
    expect(fuzzyEq("backlink", "baklink")).toBe(true);
    expect(fuzzyEq("seo", "ceo")).toBe(false);            // too short to fuzz
    expect(fuzzyEq("health", "weather")).toBe(false);     // too different
  });
});
