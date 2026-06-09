import { describe, it, expect } from "vitest";
import { parseBacklinkSheet } from "./parse-sheet";

const CSV = [
  ",GULFRECOVERYGROUP,,,,,",
  "ARTICLE/BLOGS,BACKLINK,KEYWORD,URL,Indexed In Google,STATUS,REMARKS",
  ",,,,,,",
  ",6/8/2026,,,,,",
  "bentretv.org.vn,https://bentretv.org.vn/blogs/5704,استشارة لاسترداد الأموال,https://gulfrecoverygroup.com/,,Submitted,June GRG",
  "dnake.ma,https://dnake.ma/read,احتيال,https://gulfrecoverygroup.com/,Yes,Live,",
  ",5/22/2026,,,,,",
  "example.com,https://example.com/x,\"anchor, with comma\",https://gulfrecoverygroup.com/,,Submitted,",
].join("\n");

describe("parseBacklinkSheet", () => {
  it("parses rows under each date section", () => {
    const rows = parseBacklinkSheet(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      source_site: "bentretv.org.vn",
      source_url: "https://bentretv.org.vn/blogs/5704",
      anchor_text: "استشارة لاسترداد الأموال",
      target_url: "https://gulfrecoverygroup.com/",
      indexed: null,
      status: "Submitted",
      remarks: "June GRG",
      date: "2026-06-08",
    });
    expect(rows[1].status).toBe("Live");
    expect(rows[1].indexed).toBe("Yes");
    expect(rows[2].date).toBe("2026-05-22");
  });
  it("handles quoted fields with embedded commas", () => {
    const rows = parseBacklinkSheet(CSV);
    expect(rows[2].anchor_text).toBe("anchor, with comma");
  });
  it("skips title/header/blank rows", () => {
    expect(parseBacklinkSheet(",GULFRECOVERYGROUP,,,,,\nARTICLE/BLOGS,BACKLINK,KEYWORD,URL,,,\n").length).toBe(0);
  });
});
