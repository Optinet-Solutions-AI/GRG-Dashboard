// What a capture run should tell its scheduler.
//
// This script ran nightly from 2026-09-16 to 2026-10-30 capturing nothing, and reported
// success every time: it printed "Updated 0 URL(s)" and exited 0. Whoever scheduled it had
// no way to know. The only symptom was PageSpeed cards missing their proof image, which
// nobody is watching for.
//
// So: a run that did not capture what it set out to capture exits non-zero, and says what
// usually causes it, because the message the report page gives ("Unable to resolve <url>")
// sends the reader after the wrong thing entirely.

/** @param {{attempted: number, captured: number}} counts */
export function runOutcome({ attempted, captured }) {
  if (attempted === 0) {
    return { ok: true, exitCode: 0, message: "Nothing to capture." };
  }
  if (captured === attempted) {
    return { ok: true, exitCode: 0, message: `Captured all ${attempted} URL(s).` };
  }
  if (captured === 0) {
    return {
      ok: false,
      exitCode: 1,
      message:
        `Captured 0 of ${attempted} URL(s). When every one fails, the report page has almost ` +
        `certainly refused the browser for looking like automation — it reports that as ` +
        `"Unable to resolve <url>", which blames the site being tested. Check psi-browser.mjs ` +
        `is still being used, and that this copy of the script is up to date.`,
    };
  }
  return {
    ok: false,
    exitCode: 1,
    message: `Captured ${captured} of ${attempted} URL(s) — the rest stored nothing. See the failures above.`,
  };
}
