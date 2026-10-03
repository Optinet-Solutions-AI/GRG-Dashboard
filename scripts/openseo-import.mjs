// Watch the OpenSEO drop folder and import any new rankings export, unattended.
//
//   node --env-file=.env.local scripts/openseo-import.mjs              scan once, import what's new
//   node --env-file=.env.local scripts/openseo-import.mjs --dry        report only, write nothing
//   node --env-file=.env.local scripts/openseo-import.mjs --dir "D:/x" scan a different folder
//   node --env-file=.env.local scripts/openseo-import.mjs --force      re-import files already done
//
// OpenSEO is driven by hand, so results appear whenever the operator finishes a run. This
// script is scheduled (every 5 minutes) rather than triggered, so a CSV dropped into the
// folder reaches the dashboard without anyone asking. It handles all three GRG domains —
// .com, .org and .net — routing each file by its name, so one schedule covers the lot.
//
// Safe to run repeatedly: a file is imported once, keyed on its path + size + mtime, and
// re-importing the same week only rewrites that week's pairs.
//
// The keyword policy lives in src/lib/rankings/openseo.mjs and is unit-tested there.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  parseOpenSeoCsv, classifyKeywords, pickWeek, siteFromFilename, exportDate,
} from "../src/lib/rankings/openseo.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const DIR = opt("--dir", process.env.OPENSEO_DROP_DIR || "D:/Open SEO");
const DRY = flag("--dry");
const FORCE = flag("--force");
const STATE = path.join(process.cwd(), ".tmp", "openseo-imported.json");
const LOG = path.join(process.cwd(), ".tmp", "openseo-watch.log");
// A file still being written must not be half-imported.
const SETTLE_MS = 20000;

function log(line) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const msg = `[${stamp}] ${line}`;
  console.log(msg);
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, msg + "\n");
  } catch { /* logging must never break an import */ }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; }
}
function writeState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

async function importFile(client, file, rows) {
  const domain = siteFromFilename(path.basename(file));
  if (!domain) throw new Error("cannot tell which site this export is for from its filename");

  const site = (await client.query("select id from sites where domain = $1", [domain])).rows[0];
  if (!site) throw new Error(`no site row for ${domain}`);

  const date = exportDate(rows);
  if (!date) throw new Error("no usable 'Current update date' in the export");

  const weeks = (await client.query(
    "select distinct week_date::text w from rankings where site_id = $1 order by w", [site.id],
  )).rows.map((r) => r.w);
  const target = pickWeek(date, weeks);

  // "Tracked" is per site: a keyword on .com is not automatically tracked on .org, so the
  // top-100 adoption rule still applies to it there.
  const trackedRows = await client.query(
    `select distinct k.text from rankings r join keywords k on k.id = r.keyword_id
     where r.site_id = $1`, [site.id]);
  const tracked = new Set(trackedRows.rows.map((r) => r.text.trim()));
  const { adopt, skip, known } = classifyKeywords(rows, tracked);

  const countries = new Map((await client.query("select id, code from countries")).rows
    .map((r) => [r.code.toUpperCase(), r.id]));
  const keywords = new Map((await client.query("select id, text from keywords")).rows
    .map((r) => [r.text.trim(), r.id]));

  const summary = {
    file: path.basename(file), site: domain, week: target.week, mode: target.mode,
    rows: rows.length, known: known.length, adopted: adopt.length, skipped: skip.length,
  };
  if (DRY) return { ...summary, written: 0, ranked: 0, dryRun: true };

  await client.query("begin");
  try {
    let maxSort = (await client.query("select coalesce(max(sort_order), 0) m from keywords")).rows[0].m;
    for (const a of adopt) {
      if (keywords.has(a.keyword)) continue; // text already in the shared keywords table — reuse it
      const ins = await client.query(
        "insert into keywords (text, sort_order, active, language) values ($1, $2, true, $3) returning id",
        [a.keyword, ++maxSort, a.language]);
      keywords.set(a.keyword, ins.rows[0].id);
    }

    // Only keywords that earned a place get rows; the rest are deliberately dropped.
    const keep = new Set([...known, ...adopt.map((a) => a.keyword)]);
    const payload = rows
      .filter((r) => keep.has(r.keyword) && keywords.has(r.keyword) && countries.has(r.countryCode))
      .map((r) => ({ kid: keywords.get(r.keyword), cid: countries.get(r.countryCode), pos: r.current }));

    if (target.mode === "new") {
      // The export is authoritative for a week it opens: clear it, then write exactly its pairs.
      await client.query("delete from rankings where site_id = $1 and week_date = $2", [site.id, target.week]);
    } else {
      // Merging into a week another part of the same sweep opened: replace only this file's
      // pairs so the earlier part survives.
      await client.query(
        `delete from rankings where site_id = $1 and week_date = $2
         and (keyword_id, country_id) in (select unnest($3::uuid[]), unnest($4::uuid[]))`,
        [site.id, target.week, payload.map((p) => p.kid), payload.map((p) => p.cid)]);
    }
    for (const p of payload) {
      await client.query(
        "insert into rankings (week_date, site_id, country_id, keyword_id, position) values ($1,$2,$3,$4,$5)",
        [target.week, site.id, p.cid, p.kid, p.pos]);
    }
    // Record that the check HAPPENED, separately from what it found. Without this a site
    // that was checked and ranked nowhere (.org's first run: 50 keywords, none in the top
    // 100) is indistinguishable from one that was never checked — both store zero rows.
    const markets = [...new Set(rows.map((r) => r.countryCode))].sort();
    const contribution = {
      keywords: new Set(rows.map((r) => r.keyword)).size,
      pairs: rows.length,
      ranked: rows.filter((r) => r.current !== null).length,
      markets,
    };
    await client.query(
      `insert into ranking_checks (site_id, week_date, contributions, keywords_checked, pairs_checked, pairs_ranked, markets)
       values ($1, $2, jsonb_build_object($3::text, $4::jsonb), 0, 0, 0, '{}')
       on conflict (site_id, week_date) do update
         set contributions = ranking_checks.contributions || excluded.contributions,
             updated_at = now()`,
      [site.id, target.week, path.basename(file), JSON.stringify(contribution)]);
    // Totals are derived from the per-file contributions, so re-importing a file replaces
    // only its own share instead of double-counting.
    // Counts and markets are aggregated in separate subqueries on purpose: unnesting the
    // markets array alongside the sums would multiply the rows and inflate every total.
    await client.query(
      `with totals as (
         select coalesce(sum((v->>'keywords')::int), 0) kw,
                coalesce(sum((v->>'pairs')::int), 0) pairs,
                coalesce(sum((v->>'ranked')::int), 0) ranked
         from ranking_checks rc, jsonb_each(rc.contributions) kv(k, v)
         where rc.site_id = $1 and rc.week_date = $2
       ), mk as (
         select coalesce(array_agg(distinct m), '{}'::text[]) markets
         from ranking_checks rc, jsonb_each(rc.contributions) kv(k, v),
              jsonb_array_elements_text(v->'markets') m
         where rc.site_id = $1 and rc.week_date = $2
       )
       update ranking_checks c
          set keywords_checked = totals.kw, pairs_checked = totals.pairs,
              pairs_ranked = totals.ranked, markets = mk.markets
         from totals, mk
        where c.site_id = $1 and c.week_date = $2`,
      [site.id, target.week]);

    await client.query("commit");
    return {
      ...summary, written: payload.length, ranked: payload.filter((p) => p.pos !== null).length,
      checkedPairs: contribution.pairs, checkedRanked: contribution.ranked,
    };
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

async function main() {
  if (!fs.existsSync(DIR)) { log(`drop folder not found: ${DIR} - nothing to do`); return; }
  const candidates = fs.readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv") && /openseo|grg/i.test(f))
    .map((f) => path.join(DIR, f));
  if (!candidates.length) return;

  const state = readState();
  const now = Date.now();
  const todo = [];
  for (const file of candidates) {
    const st = fs.statSync(file);
    const key = `${st.size}:${Math.round(st.mtimeMs)}`;
    if (!FORCE && state[file]?.key === key) continue;
    if (now - st.mtimeMs < SETTLE_MS) { log(`${path.basename(file)} still being written - next pass`); continue; }
    todo.push({ file, key });
  }
  if (!todo.length) return;

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const { file, key } of todo) {
      // Content problems (not a rankings export, unknown domain) are permanent for these
      // bytes, so record them and stop retrying — otherwise an unrelated CSV sitting in the
      // folder reports the same failure every five minutes forever. Database problems are
      // NOT recorded, so a transient outage retries on the next pass.
      let rows;
      try {
        rows = parseOpenSeoCsv(fs.readFileSync(file, "utf8"));
        if (!siteFromFilename(path.basename(file))) throw new Error("filename doesn't name a known site");
      } catch (e) {
        log(`SKIP ${path.basename(file)}: ${e.message}`);
        if (!DRY) { state[file] = { key, skippedAt: new Date().toISOString(), reason: e.message }; writeState(state); }
        continue;
      }
      try {
        const r = await importFile(client, file, rows);
        log(`${r.file} -> ${r.site} week ${r.week} (${r.mode}): ${r.written} pairs, ${r.ranked} ranking; ` +
            `${r.known} tracked, ${r.adopted} adopted, ${r.skipped} skipped as unranked${r.dryRun ? " [DRY]" : ""}`);
        if (!DRY) { state[file] = { key, importedAt: new Date().toISOString(), ...r }; writeState(state); }
      } catch (e) {
        // One bad file must not stop the others, and must not be marked done.
        log(`FAILED ${path.basename(file)}: ${e.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { log(`FATAL: ${e.message}`); process.exit(1); });
