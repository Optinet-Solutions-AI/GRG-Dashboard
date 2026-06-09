// Capture the REAL Google PageSpeed Insights report page (gauges + "Report from <time>")
// for every active pagespeed_url, mobile + desktop, and store it as the proof screenshot.
// This needs a real browser, so it runs here (not on the Vercel cron). Scores are still
// refreshed automatically by the cron via the PSI API; this adds the visual proof.
//
//   node --env-file=.env scripts/capture-psi-report.mjs
//
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function captureReport(page, url, strategy) {
  const target = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Dismiss the cookie banner if present.
  try { await page.getByRole("button", { name: /Ok, Got it/i }).click({ timeout: 4000 }); } catch { /* none */ }
  // "Captured at …" only appears once the live audit finishes.
  // NOTE: 3rd arg is options; the 2nd (arg) must be present or the timeout is ignored (defaults to 30s).
  await page.waitForFunction(() => /Captured at/i.test(document.body.innerText), null, { timeout: 150000 });
  await page.waitForTimeout(2500);
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
  return page.screenshot({ clip: { x: 0, y: 0, width: 1000, height }, type: "png" });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: urls, error } = await db.from("pagespeed_urls").select("id, url").eq("active", true).order("sort_order");
  if (error) throw new Error(error.message);
  if (!urls?.length) { console.log("No active PageSpeed URLs."); return; }

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
        const buf = await captureReport(page, u.url, strategy);
        const path = `pagespeed/${u.id}-${strategy}-report-${date}.png`;
        const up = await db.storage.from("screenshots").upload(path, buf, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error(up.error.message);
        patch[`${strategy}_screenshot_path`] = path;
        console.log("ok");
      } catch (e) {
        console.log("FAILED:", e.message);
      }
    }
    // Attach screenshots to today's entry (created by the score cron); leaves scores untouched.
    const { error: upErr } = await db.from("pagespeed_entries").upsert(patch, { onConflict: "pagespeed_url_id,date" });
    if (upErr) console.log("DB update failed:", upErr.message);
    else done++;
  }

  await browser.close();
  console.log(`\nDone. Updated ${done} URL(s) with proof screenshots for ${date}.`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
