import { describe, it, expect } from "vitest";
import { LAUNCH_OPTIONS, CONTEXT_OPTIONS, maskAutomation } from "./psi-browser.mjs";

/**
 * pagespeed.web.dev refuses to run an analysis for a browser that announces itself as
 * automation: every URL, including example.com, comes back "Unable to resolve <url>. Try
 * checking the URL for validity." — which reads like a problem with the site being tested
 * rather than with the browser asking. That is how six weeks of captures were lost.
 *
 * These assertions are the regression guard: strip any one of them and the captures go
 * silently back to storing nothing.
 */
describe("the browser the PSI capture drives", () => {
  it("does not announce itself as headless in the user agent", () => {
    expect(CONTEXT_OPTIONS.userAgent).toBeTruthy();
    expect(CONTEXT_OPTIONS.userAgent).not.toMatch(/headless/i);
  });

  it("claims a Chrome version, since the report page is a Chrome-only tool", () => {
    expect(CONTEXT_OPTIONS.userAgent).toMatch(/Chrome\/\d+/);
  });

  it("turns off the automation-controlled flag Chromium sets by default", () => {
    expect(LAUNCH_OPTIONS.args).toContain("--disable-blink-features=AutomationControlled");
  });

  it("hides navigator.webdriver, which the page reads directly", () => {
    const navigator = { webdriver: true };
    const globalScope = { navigator, Object };
    // Run the init script against a stand-in navigator the way the browser would.
    new Function("navigator", "Object", `(${maskAutomation.toString()})()`)(navigator, Object);
    expect(globalScope.navigator.webdriver).toBeUndefined();
  });
});
