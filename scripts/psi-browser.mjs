// How the PSI capture has to present itself to pagespeed.web.dev.
//
// The report page refuses to run an analysis for a browser that looks automated, and it
// says so in a way that points at the wrong thing: "Unable to resolve <url>. Try checking
// the URL for validity." Every URL fails that way, example.com included, while the PSI API
// answers for the same URL in the same second. Chased as a site problem, it is unfindable.
//
// Keep these three together — they are one disguise, and dropping any of them puts the
// captures back to storing nothing, silently, for as long as nobody looks at a card.

/** A current Chrome on Windows. Playwright's default announces HeadlessChrome, which is refused. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export const LAUNCH_OPTIONS = { args: ["--disable-blink-features=AutomationControlled"] };

export const CONTEXT_OPTIONS = {
  viewport: { width: 1000, height: 1500 },
  deviceScaleFactor: 2,
  userAgent: USER_AGENT,
  locale: "en-US",
};

/** Runs before page scripts: navigator.webdriver is true under automation, and is read directly. */
export function maskAutomation() {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
}
