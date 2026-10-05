/**
 * OpenSEO export handling — parsing, keyword policy, and which week a file belongs to.
 *
 * OpenSEO replaced the BPN tracker as the ranking source. It is driven by hand (no cron, by
 * request), and it hands back a CSV. Everything here is pure so the rules can be tested
 * without a database or a file on disk; `scripts/openseo-import.mjs` wires it up.
 */

/**
 * @typedef {{ keyword: string, countryCode: string, current: number|null,
 *             previous: number|null, date: string }} OpenSeoRow
 * `current: null` means NR — checked, not in the top 100.
 */

/** RFC4180-ish reader: handles quoted fields, doubled quotes and CRLF. */
export function parseDelimited(text, delimiter = ",") {
  const out = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

/** A position counts only as an integer in 1..100. "NR", 0, blank and junk are all NR (null). */
function position(raw) {
  const s = (raw ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 100 ? n : null;
}

export function parseOpenSeoCsv(text) {
  const grid = parseDelimited(text.replace(/^﻿/, ""));
  if (!grid.length) throw new Error("Empty export.");
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const at = (name) => header.indexOf(name.toLowerCase());
  const iKw = at("Keyword"), iCc = at("Country code"), iCur = at("Current position");
  const iPrev = at("Previous position"), iDate = at("Current update date");
  if (iKw < 0 || iCc < 0 || iCur < 0) {
    throw new Error("Unrecognized export: missing Keyword / Current position / Country code columns.");
  }
  /** @type {OpenSeoRow[]} */
  const rows = [];
  for (const r of grid.slice(1)) {
    const keyword = (r[iKw] ?? "").trim();
    const countryCode = (r[iCc] ?? "").trim().toUpperCase();
    if (!keyword || !countryCode) continue;
    rows.push({
      keyword,
      countryCode,
      current: position(r[iCur]),
      previous: position(r[iPrev]),
      date: (r[iDate] ?? "").trim(),
    });
  }
  return rows;
}

/** Which of the three GRG domains an export belongs to, from its filename. */
export function siteFromFilename(name) {
  const n = name.toLowerCase();
  if (/(^|[^a-z])\.?org([^a-z]|$)/.test(n) || n.includes(".org")) return "gulfrecoverygroup.org";
  if (/(^|[^a-z])\.?net([^a-z]|$)/.test(n) || n.includes(".net")) return "gulfrecoverygroup.net";
  if (/(^|[^a-z])\.?com([^a-z]|$)/.test(n) || n.includes(".com")) return "gulfrecoverygroup.com";
  return null;
}

const ARABIC = /[؀-ۿ]/;

/**
 * The key two spellings of the same keyword must share.
 *
 * OpenSEO lower-cases Latin text, so an Arabic keyword containing a Latin token comes back
 * changed: the sheet's "تتبع محفظة USDT" returns as "تتبع محفظة usdt". Matched literally that
 * is a different keyword, so it was adopted as a second row — 15 of them — and the roster kept
 * pointing at the original, which then showed "Not checked" forever while its results sat on
 * the duplicate. Width and whitespace differences would do the same.
 *
 * Display text is never normalised; this is only ever used for lookups.
 */
export function keywordKey(text) {
  return String(text).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** @typedef {{ keyword: string, language: 'ar'|'en', reason: string }} Adoption */

/**
 * Decide which keywords in an export earn a permanent place.
 *
 * The user's rule: keywords already tracked stay forever, ranked or not. A NEW keyword is
 * only adopted if it ranks in the top 100 somewhere — otherwise the dashboard fills up with
 * hundreds of candidates that have never ranked.
 *
 * That rule exists to protect an ESTABLISHED keyword set from being swamped by candidates.
 * A site being tracked for the first time has no set to protect — the export IS its set — so
 * `establishing` adopts everything, and the grid shows the whole list with "Not in top 100"
 * against the ones that don't rank yet. Without it .org stored nothing at all: 98 keywords
 * were checked across six markets, none reached the top 100, and the page had no table to
 * draw. From the following week on the strict rule applies again.
 *
 * The one exception is the English set, which is the counterpart of .com's permanent main
 * keywords: it is adopted on arrival, unranked included, so the English grid is populated
 * from day one. That exception applies only to a site that ALREADY tracks keywords — on a
 * site with no history there is no permanent set for English to be the counterpart of, so a
 * Latin-script keyword there follows the same top-100 rule as everything else.
 */
export function classifyKeywords(rows, tracked, opts = {}) {
  const { establishing = false } = opts;
  const established = tracked.size > 0;
  /** @type {Map<string, OpenSeoRow[]>} */
  const byKeyword = new Map();
  for (const r of rows) {
    const list = byKeyword.get(r.keyword) ?? [];
    list.push(r);
    byKeyword.set(r.keyword, list);
  }
  /** @type {Adoption[]} */
  const adopt = [];
  const skip = [];
  const known = [];
  // Tracked keywords are matched on their key, so a case-folded spelling is recognised as the
  // keyword it already is rather than adopted as a new one.
  const trackedKeys = new Set([...tracked].map(keywordKey));
  for (const [keyword, list] of byKeyword) {
    if (trackedKeys.has(keywordKey(keyword))) { known.push(keyword); continue; }
    const english = !ARABIC.test(keyword);
    if (establishing) {
      adopt.push({
        keyword,
        language: english ? "en" : "ar",
        reason: "first run for this site — the export defines the tracked set",
      });
      continue;
    }
    if (english && established) {
      adopt.push({ keyword, language: "en", reason: "English set — goes in the English grid" });
      continue;
    }
    const hit = list.find((r) => r.current !== null);
    if (hit) {
      adopt.push({
        keyword,
        language: english ? "en" : "ar",
        reason: `ranks #${hit.current} in ${hit.countryCode}`,
      });
    } else skip.push(keyword);
  }
  return { adopt, skip, known };
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** @typedef {{ week: string, mode: 'merge'|'new' }} WeekTarget */

/**
 * Which week an export writes into.
 *
 * A single sweep often arrives in pieces — the first .com run came back a quarter complete and
 * the rest followed on another day. Filed under its own date, the follow-up would become a
 * second, equally sparse week sitting next to the first instead of completing it. So an export
 * dated within `windowDays` of an existing week MERGES into that week; anything else starts a
 * new one.
 */
export function pickWeek(csvDate, existingWeeks, windowDays = 6) {
  const near = existingWeeks
    .filter((w) => w <= csvDate && daysBetween(csvDate, w) <= windowDays)
    .sort()
    .pop();
  return near ? { week: near, mode: "merge" } : { week: csvDate, mode: "new" };
}

/** The export's own date: the latest check date it carries. */
export function exportDate(rows) {
  const dates = rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return dates.at(-1) ?? null;
}

/**
 * Work out which site an export belongs to from its KEYWORDS, when the filename doesn't say.
 *
 * Filename routing covers the agreed naming, but the operator writes those names by hand and
 * a file that doesn't match is skipped — silently, from the user's point of view. The three
 * GRG sites track almost disjoint keyword sets, so the keywords themselves identify the site
 * far more reliably than its name does.
 *
 * Deliberately conservative: it needs a clear majority of the file's keywords to belong to
 * one site AND that site to be well ahead of the runner-up. A guess here would write a whole
 * sweep to the wrong dashboard, which is much worse than skipping the file and saying so.
 *
 * @param {OpenSeoRow[]} rows
 * @param {Record<string, string[]>} fingerprints domain -> its known keywords
 * @returns {{ domain: string, share: number, runnerUp: number } | null}
 */
export function siteFromKeywords(rows, fingerprints) {
  const keywords = new Set(rows.map((r) => r.keyword.trim()));
  if (keywords.size === 0) return null;

  const scores = Object.entries(fingerprints)
    .map(([domain, list]) => {
      const known = new Set(list.map((k) => k.trim()));
      let hits = 0;
      for (const k of keywords) if (known.has(k)) hits++;
      return { domain, share: hits / keywords.size };
    })
    .sort((a, b) => b.share - a.share);

  const [best, second] = scores;
  if (!best || best.share < 0.6) return null;
  const runnerUp = second?.share ?? 0;
  if (best.share - runnerUp < 0.25) return null; // too close to call
  return { domain: best.domain, share: best.share, runnerUp };
}
