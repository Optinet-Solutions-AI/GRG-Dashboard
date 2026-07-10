// Import an Ahrefs Rank Tracker export (UTF-16LE, tab-delimited) into the `rankings` table.
// Loads TWO weekly snapshots from one file: the "previous" positions (dated 7 days earlier)
// and the "current" positions (dated to the export's update date) so movement shows immediately.
//
// Any keyword in the export that is not yet in the `keywords` table is AUTO-CREATED (never
// silently dropped), so newly-tracked keywords — including country-specific ones — flow in
// with zero manual seeding. Ahrefs is the source of truth for keyword text.
//
// Usage: npm run import:rankings -- "path/to/export.csv" [--site gulfrecoverygroup.com] [--dry-run]
//   --dry-run  parse + report what WOULD be created/upserted without writing anything.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file || file.startsWith("--")) { console.error("usage: import-rankings.mjs <export.csv> [--site <domain>] [--dry-run]"); process.exit(1); }
const siteArgIdx = process.argv.indexOf("--site");
const siteDomain = siteArgIdx > -1 ? process.argv[siteArgIdx + 1] : "gulfrecoverygroup.com";
const dryRun = process.argv.includes("--dry-run");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function clean(s) {
  return String(s ?? "").replace(/^﻿/, "").replace(/[‎‏‪-‮]/g, "").trim().replace(/^"([\s\S]*)"$/, "$1").trim();
}
function toPos(s) {
  const n = parseInt(clean(s), 10);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null; // empty / >100 => NR (null)
}
function minus7(isoDate) {
  const d = new Date(isoDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10);
}

function parse(path) {
  let text = readFileSync(path, "utf16le").replace(/^﻿/, "");
  // fall back to utf8 if utf16 produced no tabs (mis-detected encoding)
  if (!text.includes("\t") && !text.includes(",")) text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const delim = lines[0].split("\t").length >= lines[0].split(",").length ? "\t" : ",";
  const header = lines[0].split(delim).map(clean);
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cols = { kw: idx("Keyword"), prev: idx("Previous position"), cur: idx("Current position"), cc: idx("Country code"), date: idx("Current update date") };
  const rows = lines.slice(1).map((l) => { const f = l.split(delim); return {
    keyword: clean(f[cols.kw]), cc: clean(f[cols.cc]).toUpperCase(),
    prev: f[cols.prev], cur: f[cols.cur], date: clean(f[cols.date]).slice(0, 10),
  }; });
  return { header, cols, rows };
}

async function main() {
  const { header, cols, rows } = parse(file);
  console.log(`Parsed ${rows.length} rows; ${header.length} columns; key column indices:`, cols);
  if (cols.kw < 0 || cols.cur < 0 || cols.cc < 0) throw new Error("Could not find Keyword/Current position/Country code columns — check the export format.");
  if (dryRun) console.log("DRY RUN — no writes will be performed.");

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const weekCur = dates.at(-1) || new Date().toISOString().slice(0, 10);
  const weekPrev = minus7(weekCur);
  console.log(`Snapshots -> current week: ${weekCur}, previous week: ${weekPrev}`);

  const site = (await db.from("sites").select("id").eq("domain", siteDomain).single()).data;
  if (!site) throw new Error("site not found: " + siteDomain);
  const kws = (await db.from("keywords").select("id, text, sort_order")).data;
  const cts = (await db.from("countries").select("id, code, sort_order")).data;
  const kwMap = new Map(kws.map((k) => [k.text.trim(), k.id]));
  const ccMap = new Map(cts.map((c) => [c.code.toUpperCase(), c.id]));
  const ccSort = new Map(cts.map((c) => [c.code.toUpperCase(), c.sort_order ?? 0]));

  // --- Auto-create keywords present in the export but missing from the DB ---------------
  // Group new keywords by the country they were tracked in (so the grid lists per-country
  // blocks in order) then by text; assign sort_order after the current max.
  const missing = new Map(); // text -> country sort_order (min seen)
  for (const r of rows) {
    if (!r.keyword || kwMap.has(r.keyword)) continue;
    const cs = ccSort.has(r.cc) ? ccSort.get(r.cc) : 9999; // unknown-country keywords sort last
    missing.set(r.keyword, Math.min(missing.get(r.keyword) ?? Infinity, cs));
  }
  if (missing.size) {
    let nextSort = kws.reduce((m, k) => Math.max(m, k.sort_order ?? 0), 0);
    const newRows = [...missing.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ar"))
      .map(([text]) => ({ text, sort_order: ++nextSort, active: true }));
    console.log(`New keywords to create: ${newRows.length}`);
    newRows.forEach((k) => console.log(`  + [${k.sort_order}] ${k.text}`));
    if (!dryRun) {
      const ins = await db.from("keywords").insert(newRows).select("id, text");
      if (ins.error) throw new Error("keyword insert failed: " + ins.error.message);
      ins.data.forEach((k) => kwMap.set(k.text.trim(), k.id));
    } else {
      newRows.forEach((k, i) => kwMap.set(k.text.trim(), `dry-${i}`)); // let counts below reflect a real run
    }
  } else {
    console.log("New keywords to create: 0 (all export keywords already in DB)");
  }

  const payload = [];
  const badKw = new Set(), badCc = new Set();
  for (const r of rows) {
    const kid = kwMap.get(r.keyword), cid = ccMap.get(r.cc);
    if (!kid) { badKw.add(r.keyword); continue; }
    if (!cid) { badCc.add(r.cc); continue; }
    payload.push({ week_date: weekPrev, site_id: site.id, country_id: cid, keyword_id: kid, position: toPos(r.prev) });
    payload.push({ week_date: weekCur, site_id: site.id, country_id: cid, keyword_id: kid, position: toPos(r.cur) });
  }
  console.log(`Matched ${payload.length / 2} keyword×country pairs | unmatched keywords: ${badKw.size} | unmatched countries: ${badCc.size}`);
  if (badKw.size) console.log("  unmatched keyword sample:", [...badKw].slice(0, 8));
  if (badCc.size) console.log("  unmatched countries:", [...badCc]);

  if (payload.length && !dryRun) {
    const r = await db.from("rankings").upsert(payload, { onConflict: "week_date,site_id,country_id,keyword_id" }).select("id");
    if (r.error) throw new Error(r.error.message);
    const rankedCur = payload.filter((p) => p.week_date === weekCur && p.position !== null).length;
    console.log(`Upserted ${r.data.length} ranking rows across 2 weeks. Current week: ${rankedCur} ranked / ${payload.length / 2 - rankedCur} NR.`);
  } else if (payload.length && dryRun) {
    const rankedCur = payload.filter((p) => p.week_date === weekCur && p.position !== null).length;
    console.log(`Would upsert ${payload.length} ranking rows across 2 weeks. Current week: ${rankedCur} ranked / ${payload.length / 2 - rankedCur} NR.`);
  }
  console.log(dryRun ? "DONE (dry run — nothing written)" : "DONE");
}
main().catch((e) => { console.error("IMPORT ERROR:", e.message); process.exit(1); });
