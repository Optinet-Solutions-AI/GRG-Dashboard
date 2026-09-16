// Capture the REAL Google PageSpeed Insights report page (gauges + "Report from <time>")
// for every active pagespeed_url, mobile + desktop, and store it as the proof screenshot.
// This needs a real browser, so it runs here (not on the Vercel cron). Scores are still
// refreshed automatically by the cron via the PSI API; this adds the visual proof.
//
//   node --env-file=.env scripts/capture-psi-report.mjs            all active URLs
//   node --env-file=.env scripts/capture-psi-report.mjs .com .net   only matching URLs
//
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readScores(page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const pick = (label) => { const m = t.match(new RegExp("(\\d{1,3})\\s+" + label)); return m ? parseInt(m[1], 10) : null; };
    return { performance: pick("Performance"), accessibility: pick("Accessibility"), bestPractices: pick("Best Practices"), seo: pick("SEO") };
  });
}

async function captureReport(page, url, strategy) {
  const target = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Dismiss the cookie banner if present.
  try { await page.getByRole("button", { name: /Ok, Got it/i }).click({ timeout: 4000 }); } catch { /* none */ }
  // Wait for the thing we actually need — a scrapeable score beside the Performance gauge.
  //
  // This used to wait for the text "Captured at", which Google's UI no longer prints: the
  // header now reads "Report from <time>" and appears within seconds, long before the audit
  // finishes. Every capture therefore timed out at 150s and the run stored blank rows
  // instead of screenshots. Waiting on the report's own numbers cannot drift like a caption
  // can — if they are on screen, both the screenshot and the scrape are valid.
  //
  // NOTE: 3rd arg is options; the 2nd (arg) must be present or the timeout is ignored.
  //
  // Stop early when PSI reports it couldn't run, instead of waiting out the full timeout.
  // Google answers a fetch failure with "Unable to resolve <url>" and leaves the page
  // sitting there — indistinguishable from a slow audit unless you look for it, which cost
  // five minutes per attempt on .com/desktop.
  const outcome = await page.waitForFunction(() => {
    const t = document.body.innerText;
    if (/\d{1,3}\s+Performance/.test(t)) return "ready";
    // Only messages that mean the run itself failed. "Enter a valid URL" is NOT one of
    // them — it is the input's own placeholder and sits on the page while a perfectly
    // healthy audit is still running, so matching it aborted good captures.
    const err = t.match(/Unable to resolve[^.]*|Lighthouse returned error[^.]*/i);
    return err ? `error:${err[0].slice(0, 120)}` : false;
  }, null, { timeout: 300000 }).then((h) => h.jsonValue());
  if (outcome !== "ready") throw new Error(outcome.replace(/^error:/, "PSI could not analyse the page — "));
  // The gauges blank out for a moment while the panel re-renders, so read twice a second
  // apart and only continue once the two agree — otherwise the scrape lands in that gap and
  // returns nulls for a report that is plainly on screen.
  let stable = null;
  for (let i = 0; i < 40; i++) {
    const a = await readScores(page);
    await page.waitForTimeout(1000);
    const b = await readScores(page);
    if (a.performance != null && a.performance === b.performance) { stable = b; break; }
  }
  if (!stable) throw new Error("scores never settled");
  await page.waitForTimeout(1500);
  // Cut cleanly just below the 4 category gauges, not through the big gauge below them.
  const cutY = await page.evaluate(() => {
    const labels = ["Performance", "Accessibility", "Best Practices", "SEO"];
    let maxBottom = 0;
    for (const el of Array.from(document.querySelectorAll("*"))) {
      if (el.children.length === 0 && labels.includes((el.textContent || "").trim())) {
        const r = el.getBoundingClientRect();
        if (r.top > 0 && r.top < 620 && r.bottom > maxBottom) maxBottom = r.bottom;
      }
    }
    return maxBottom;
  });
  const height = cutY > 200 ? Math.min(Math.ceil(cutY + 28), 1400) : 540;
  const scores = stable;
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: 1000, height }, type: "png" });
  return { buffer, scores };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: allUrls, error } = await db.from("pagespeed_urls").select("id, url").eq("active", true).order("sort_order");
  if (error) throw new Error(error.message);
  // Optional filters: re-capturing one site shouldn't cost a live audit on the other two,
  // and pagespeed.web.dev throttles repeated audits from one IP.
  const filters = process.argv.slice(2).map((a) => a.toLowerCase());
  const urls = filters.length
    ? (allUrls ?? []).filter((u) => filters.some((f) => u.url.toLowerCase().includes(f)))
    : (allUrls ?? []);
  if (!urls.length) { console.log(filters.length ? `No active URL matches ${filters.join(", ")}.` : "No active PageSpeed URLs."); return; }

  const date = todayLocal();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  let done = 0;
  for (const u of urls) {
    const patch = { pagespeed_url_id: u.id, date };
    for (const strategy of ["mobile", "desktop"]) {
      try {
        process.stdout.write(`Capturing ${strategy} report for ${u.url} … `);
        const res = await captureReport(page, u.url, strategy);
        const s = res.scores;
        patch[`${strategy}_score`] = s.performance;
        patch[`${strategy}_accessibility`] = s.accessibility;
        patch[`${strategy}_best_practices`] = s.bestPractices;
        patch[`${strategy}_seo`] = s.seo;
        const path = `pagespeed/${u.id}-${strategy}-report-${date}.png`;
        const up = await db.storage.from("screenshots").upload(path, res.buffer, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error(up.error.message);
        patch[`${strategy}_screenshot_path`] = path;
        console.log(`ok (perf ${s.performance})`);
      } catch (e) {
        console.log("FAILED:", e.message);
      }
    }
    // Nothing captured? Store nothing. The old code inserted `patch` regardless, so a run
    // where every capture failed left one blank card per site on the dashboard — which is
    // exactly what 2026-09-16 looked like before this fix.
    const captured = Object.keys(patch).some((k) => k.endsWith("_screenshot_path"));
    if (!captured) {
      console.log(`  nothing captured for ${u.url} — storing nothing`);
      continue;
    }

    // Attach to today's existing entry (the score cron may have made one) rather than
    // adding a second card for the same day. Scores come from the same report as the
    // screenshot, so the numbers on the card always match the image beside them.
    const { data: existing } = await db
      .from("pagespeed_entries")
      .select("id")
      .eq("pagespeed_url_id", u.id)
      .eq("date", date)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (existing ?? [])[0];
    const { error: upErr } = row
      ? await db.from("pagespeed_entries").update(patch).eq("id", row.id)
      : await db.from("pagespeed_entries").insert(patch);
    if (upErr) console.log("DB write failed:", upErr.message);
    else done++;
  }

  await browser.close();
  console.log(`\nDone. Updated ${done} URL(s) with proof screenshots for ${date}.`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
