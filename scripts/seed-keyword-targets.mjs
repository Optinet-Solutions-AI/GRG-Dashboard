// Seed keyword_targets — the intended keyword x market roster — from the keyword sheet.
//
//   node --env-file=.env scripts/seed-keyword-targets.mjs --sheet "C:/tmp/kw.csv" --site org --site net
//   node --env-file=.env scripts/seed-keyword-targets.mjs --dry
//
// The sheet is laid out as 7 columns per site: the first is the cross-market list (run in all
// six markets) and the other six are country-specific. Inferring that shape from ranking rows
// only works when a sweep is complete, which is exactly when it isn't needed — so it is
// recorded explicitly here.
//
// .com is deliberately NOT seeded by default: its layout is already correct and is the model
// the other two follow, and a site with no rows in keyword_targets keeps the old inferred
// behaviour.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// The sheet is addressed by row number, and its blank rows are structural — they separate the
// three site blocks. parseDelimited() in openseo.mjs drops blank rows (right for an export,
// wrong here: it shifts every index below the first gap), so this reads the grid as-is.
function readGrid(text) {
  const out = [];
  let row = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out;
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const sheetPath = (() => { const i = args.indexOf("--sheet"); return i >= 0 ? args[i + 1] : "C:/tmp/kw.csv"; })();
const sites = args.reduce((acc, a, i) => (a === "--site" ? [...acc, args[i + 1]] : acc), []);
const WANT = sites.length ? sites : ["org", "net"];

// Sheet column order after the cross-market column.
const CC = ["SA", "AE", "QA", "KW", "BH", "OM"];
// 0-indexed, end-exclusive row ranges per site: [cross-market block, country block].
const BLOCKS = {
  com: { main: [2, 14], cc: [2, 14] },
  org: { main: [53, 73], cc: [53, 73] },
  net: { main: [81, 101], cc: [83, 103] },
};
const DOMAIN = (s) => `gulfrecoverygroup.${s}`;

function readSheet() {
  const grid = readGrid(fs.readFileSync(path.resolve(sheetPath), "utf8").replace(/^\uFEFF/, ""));
  return (row, col) => (grid[row]?.[col] ?? "").trim();
}

function rosterFor(site, cell) {
  const b = BLOCKS[site];
  if (!b) throw new Error(`no sheet block defined for ${site}`);
  // One entry per (group, keyword, market). The group is the sheet column it came from, so a
  // phrasing that serves both Kuwait and Bahrain appears under each of them rather than
  // collapsing into one "Selected markets" row.
  const targets = [];
  const seen = new Set();
  const add = (kw, group, codes) => {
    if (!kw) return;
    for (const c of codes) {
      const key = `${group}|${kw}|${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ keyword: kw, group, country: c });
    }
  };
  for (let r = b.main[0]; r < b.main[1]; r++) add(cell(r, 0), "ALL", CC);
  for (let r = b.cc[0]; r < b.cc[1]; r++) {
    for (let j = 0; j < CC.length; j++) add(cell(r, j + 1), CC[j], [CC[j]]);
  }
  return targets;
}

async function main() {
  const cell = readSheet();
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const siteRows = (await client.query("select id, domain from sites")).rows;
    const countryRows = (await client.query("select id, code from countries")).rows;
    const ccId = new Map(countryRows.map((r) => [r.code.toUpperCase(), r.id]));

    for (const s of WANT) {
      const site = siteRows.find((r) => r.domain === DOMAIN(s));
      if (!site) { console.log(`skip ${s}: no site row`); continue; }
      const roster = rosterFor(s, cell);

      // Keywords are shared across sites, so reuse an existing row before inserting.
      const kwId = new Map((await client.query("select id, text from keywords")).rows
        .map((r) => [r.text.trim(), r.id]));
      let maxSort = (await client.query("select coalesce(max(sort_order), 0) m from keywords")).rows[0].m;

      const pairs = [];
      let created = 0;
      if (!DRY) await client.query("begin");
      for (const t of roster) {
        let id = kwId.get(t.keyword);
        if (!id) {
          if (DRY) { created++; kwId.set(t.keyword, "dry"); continue; }
          const ins = await client.query(
            "insert into keywords (text, sort_order, active, language) values ($1,$2,true,'ar') returning id",
            [t.keyword, ++maxSort]);
          id = ins.rows[0].id;
          kwId.set(t.keyword, id);
          created++;
        }
        if (ccId.has(t.country)) pairs.push({ kid: id, cid: ccId.get(t.country), group: t.group });
      }

      const byGroup = roster.reduce((m, t) => m.set(t.group, (m.get(t.group) ?? new Set()).add(t.keyword)), new Map());
      const shape = [...byGroup.entries()].map(([g, set]) => `${g} ${set.size}`).join("  ");
      console.log(`${DOMAIN(s)}: ${pairs.length} targets, ${created} new keyword rows${DRY ? " [DRY]" : ""}`);
      console.log(`   ${shape}`);
      if (DRY) continue;

      await client.query("delete from keyword_targets where site_id = $1", [site.id]);
      for (const p of pairs) {
        await client.query(
          `insert into keyword_targets (site_id, keyword_id, country_id, group_code) values ($1,$2,$3,$4)
           on conflict do nothing`, [site.id, p.kid, p.cid, p.group]);
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
