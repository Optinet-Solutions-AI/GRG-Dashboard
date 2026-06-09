// Cloud Run Job entrypoint: capture the REAL Google PageSpeed Insights report page
// (gauges + "Report from <time>") for every active pagespeed_url, mobile + desktop,
// and store it as the proof screenshot. Reads config from env (Cloud Run injects it).
//
// Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
  try { await page.getByRole("button", { name: /Ok, Got it/i }).click({ timeout: 4000 }); } catch { /* no banner */ }
  await page.waitForFunction(() => /Captured at/i.test(document.body.innerText), { timeout: 120000 });
  await page.waitForTimeout(2500);
  return page.screenshot({ clip: { x: 0, y: 0, width: 1000, height: 660 }, type: "png" });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: urls, error } = await db.from("pagespeed_urls").select("id, url").eq("active", true).order("sort_order");
  if (error) throw new Error(error.message);
  if (!urls?.length) { console.log("No active PageSpeed URLs."); return; }

  const date = todayLocal();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  let done = 0;
  for (const u of urls) {
    const patch = { pagespeed_url_id: u.id, date };
    for (const strategy of ["mobile", "desktop"]) {
      try {
        console.log(`Capturing ${strategy} report for ${u.url} …`);
        const buf = await captureReport(page, u.url, strategy);
        const path = `pagespeed/${u.id}-${strategy}-report-${date}.png`;
        const up = await db.storage.from("screenshots").upload(path, buf, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error(up.error.message);
        patch[`${strategy}_screenshot_path`] = path;
      } catch (e) {
        console.log(`  ${strategy} FAILED:`, e.message);
      }
    }
    const { error: upErr } = await db.from("pagespeed_entries").upsert(patch, { onConflict: "pagespeed_url_id,date" });
    if (upErr) console.log("DB update failed:", upErr.message);
    else done++;
  }

  await browser.close();
  console.log(`Done. Updated ${done} URL(s) with proof screenshots for ${date}.`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
