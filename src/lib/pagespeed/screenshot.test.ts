import { describe, it, expect, vi } from "vitest";
import { decodeDataUrl, pageShotPath, isReportShot, storePsiScreenshot } from "./screenshot";

// 1x1 gif-sized payloads are enough — we only care about decoding, not pixels.
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("decodeDataUrl", () => {
  it("decodes what PSI actually returns (jpeg) and names the extension", () => {
    const d = decodeDataUrl(JPG)!;
    expect(d.ext).toBe("jpg");
    expect(d.contentType).toBe("image/jpeg");
    expect(d.buffer.length).toBeGreaterThan(0);
  });

  it("handles png too", () => {
    expect(decodeDataUrl(PNG)!.ext).toBe("png");
  });

  it("returns null for anything that isn't an image data URL", () => {
    for (const bad of ["", "https://example.com/a.png", "data:text/plain;base64,aGk=", "not a url"]) {
      expect(decodeDataUrl(bad)).toBeNull();
    }
  });
});

describe("pageShotPath / isReportShot", () => {
  it("names a page shot distinctly from the gauges report shot", () => {
    const p = pageShotPath("abc", "mobile", "2026-09-16", "jpg");
    expect(p).toBe("pagespeed/abc-mobile-page-2026-09-16.jpg");
    expect(isReportShot(p)).toBe(false);
  });

  it("recognises the existing report screenshots", () => {
    expect(isReportShot("pagespeed/abc-mobile-report-2026-09-01.png")).toBe(true);
    expect(isReportShot(null)).toBe(false);
  });
});

describe("storePsiScreenshot", () => {
  const dbWith = (error: { message: string } | null) => ({
    storage: { from: () => ({ upload: vi.fn(async () => ({ error })) }) },
  });

  it("stores the image and returns its path", async () => {
    const path = await storePsiScreenshot(dbWith(null), {
      urlId: "u1", strategy: "desktop", date: "2026-09-16", dataUrl: JPG,
    });
    expect(path).toBe("pagespeed/u1-desktop-page-2026-09-16.jpg");
  });

  it("returns null instead of throwing when the upload fails", async () => {
    // A missing image must never take down the capture that carries the scores.
    const path = await storePsiScreenshot(dbWith({ message: "bucket gone" }), {
      urlId: "u1", strategy: "mobile", date: "2026-09-16", dataUrl: PNG,
    });
    expect(path).toBeNull();
  });

  it("returns null when PSI sent no screenshot", async () => {
    expect(await storePsiScreenshot(dbWith(null), { urlId: "u1", strategy: "mobile", date: "2026-09-16", dataUrl: null })).toBeNull();
  });
});
