// Give the English grid the same shape as the Arabic one.
//
//   node --env-file=.env scripts/seed-english-targets.mjs [--dry]
//
// Two steps:
//   1. Link each English keyword to the Arabic keyword it translates (keywords.translation_of),
//      using the curated label map in src/lib/ranking/keyword-labels.ts.
//   2. Give every English keyword keyword_targets rows. A linked one BORROWS its Arabic
//      counterpart's blocks and markets, so the English grid is a mirror. An unlinked one
//      falls back to the markets it has actually been checked in, so it still appears in a
//      sensible block instead of vanishing.
//
// Worth knowing: OpenSEO's English set is not a translation of the Arabic roster — it is a
// separate, much smaller list — so most keywords take the fallback. A true mirror needs an
// English keyword sheet. The script prints exactly how many of each, every run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { keywordKey } from "../src/lib/rankings/openseo.mjs";

const DRY = process.argv.includes("--dry");
const here = path.dirname(fileURLToPath(import.meta.url));

/** Arabic -> English, read straight from the curated label map. */
function labelMap() {
  const src = fs.readFileSync(path.join(here, "..", "src", "lib", "ranking", "keyword-labels.ts"), "utf8");
  const out = new Map();
  for (const m of src.matchAll(/^\s*"([^"]+)":\s*"([^"]*)",?\s*$/gm)) {
    if (m[2]) out.set(m[1], m[2]);
  }
  return out;
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const ar = (await client.query("select id, text from keywords where language = 'ar'")).rows;
    const en = (await client.query("select id, text from keywords where language = 'en'")).rows;

    // English label -> Arabic keyword id. Trailing punctuation is ignored: the exports write
    // "my trading account is frozen." where the label has no full stop.
    const strip = (s) => keywordKey(s).replace(/[.?!،]+$/, "");
    const arById = new Map(ar.map((r) => [r.id, r.text]));
    const byLabel = new Map();
    const labels = labelMap();
    for (const row of ar) {
      const label = labels.get(row.text.trim());
      if (label) byLabel.set(strip(label), row.id);
    }

    let linked = 0;
    const unlinked = [];
    for (const row of en) {
      const target = byLabel.get(strip(row.text));
      if (!target) { unlinked.push(row); continue; }
      linked++;
      if (!DRY) {
        await client.query("update keywords set translation_of = $1 where id = $2", [target, row.id]);
      }
    }
    console.log(`English keywords: ${en.length} | linked to an Arabic keyword: ${linked} | unlinked: ${unlinked.length}`);

    // Mirror the Arabic targets for linked keywords.
    let mirrored = 0;
    if (!DRY && linked) {
      const res = await client.query(
        `insert into keyword_targets (site_id, keyword_id, country_id, group_code)
         select kt.site_id, k.id, kt.country_id, kt.group_code
         from keywords k join keyword_targets kt on kt.keyword_id = k.translation_of
         where k.language = 'en' and k.translation_of is not null
         on conflict do nothing`);
      mirrored = res.rowCount;
    }

    // Fallback for the rest: the markets they have actually been checked in. Not ideal — it
    // follows the run rather than an intended roster — but it beats dropping them from the
    // grid entirely, and it is clearly reported rather than silent.
    let fallback = 0;
    if (!DRY && unlinked.length) {
      const res = await client.query(
        `insert into keyword_targets (site_id, keyword_id, country_id, group_code)
         select distinct r.site_id, r.keyword_id, r.country_id,
                case when cnt.n >= (select count(*) from countries) then 'ALL' else co.code end
         from rankings r
         join keywords k on k.id = r.keyword_id
         join countries co on co.id = r.country_id
         join (select site_id, keyword_id, count(distinct country_id) n
               from rankings group by 1, 2) cnt
           on cnt.site_id = r.site_id and cnt.keyword_id = r.keyword_id
         where k.language = 'en' and k.translation_of is null
         on conflict do nothing`);
      fallback = res.rowCount;
    }

    console.log(`  mirrored targets: ${mirrored} | fallback targets from observed markets: ${fallback}`);
    if (unlinked.length) {
      console.log("  unlinked examples (need an English keyword sheet for a true mirror):");
      for (const r of unlinked.slice(0, 5)) console.log(`     ${r.text}`);
    }
    if (DRY) console.log("DRY RUN — nothing written.");
    void arById;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
