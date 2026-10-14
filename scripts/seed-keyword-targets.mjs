// Seed keyword_targets — the roster the ranking grid draws — from a roster file.
//
//   node --env-file=.env scripts/seed-keyword-targets.mjs [--roster <file>] [--dry]
//
// The roster is the list of keywords the dashboard SHOWS, independent of what any sweep
// happened to return: a keyword with no result for the week renders as "Not in top 100" and is
// counted as outstanding, rather than vanishing from the table.
//
// The client replaced the roster on 2026-10-14. It was a 7-column sheet — a cross-market list
// plus one column per GCC market — and is now 32 keywords per site, ALL cross-market, with no
// country-specific blocks at all. The sheet-derived blocks are therefore gone; this script no
// longer reads C:\tmp\kw.csv.
//
// Seeding REPLACES a site's roster outright. Keywords dropped from the roster keep their
// historical ranking rows, but stop being drawn — which is the point: the grid shows the
// current roster, not an archive.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { keywordKey } from "../src/lib/rankings/openseo.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const here = path.dirname(fileURLToPath(import.meta.url));
const rosterPath = (() => {
  const i = args.indexOf("--roster");
  return i >= 0 ? args[i + 1] : path.join(here, "data", "roster-2026-10-14.json");
})();

async function main() {
  const roster = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
  const group = roster.group ?? "ALL";

  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const siteRows = (await client.query("select id, domain from sites")).rows;
    const countries = (await client.query("select id, code from countries order by sort_order")).rows;

    for (const [domain, keywords] of Object.entries(roster.sites)) {
      const site = siteRows.find((r) => r.domain === domain);
      if (!site) { console.log(`skip ${domain}: no site row`); continue; }

      // Keywords are shared across sites, so reuse an existing row before inserting. Matched on
      // keywordKey so a spelling the tracker case-folded is recognised as the same keyword.
      const kwId = new Map((await client.query("select id, text from keywords")).rows
        .map((r) => [keywordKey(r.text), r.id]));
      let maxSort = (await client.query("select coalesce(max(sort_order), 0) m from keywords")).rows[0].m;

      let created = 0;
      if (!DRY) await client.query("begin");
      const ids = [];
      for (const kw of keywords) {
        let id = kwId.get(keywordKey(kw));
        if (!id) {
          created++;
          if (DRY) continue;
          const ins = await client.query(
            "insert into keywords (text, sort_order, active, language) values ($1,$2,true,'ar') returning id",
            [kw, ++maxSort]);
          id = ins.rows[0].id;
          kwId.set(keywordKey(kw), id);
        }
        ids.push(id);
      }

      console.log(`${domain}: ${keywords.length} keywords x ${countries.length} markets = ` +
                  `${keywords.length * countries.length} targets, ${created} new keyword rows${DRY ? " [DRY]" : ""}`);
      if (DRY) continue;

      await client.query("delete from keyword_targets where site_id = $1", [site.id]);
      for (const kid of ids) {
        for (const co of countries) {
          await client.query(
            `insert into keyword_targets (site_id, keyword_id, country_id, group_code)
             values ($1,$2,$3,$4) on conflict do nothing`, [site.id, kid, co.id, group]);
        }
      }
      await client.query("commit");
    }
  } catch (e) {
    try { await client.query("rollback"); } catch { /* not in a transaction */ }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
