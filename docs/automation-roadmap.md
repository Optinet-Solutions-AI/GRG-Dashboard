# Automation Roadmap

Manual entry is the default for every section. Automation is additive: a `MetricSource`
adapter pre-fills what an admin would otherwise type. Implemented live: **PageSpeed Insights**.

| Section | Source | Cost | Auth | Status | How to wire |
|---|---|---|---|---|---|
| PageSpeed | PSI API v5 | Free | none / optional key | **Live** | `src/lib/sources/pagespeed-insights.ts` + `autofillPagespeed` action |
| Ranking (weekly) | DataForSEO SERP, or GSC for own verified sites | Paid / Free | API key / OAuth | Seam stub | Implement a ranking source; call it from `src/app/api/cron/ranking/route.ts`; add a Vercel Cron entry |
| Health (DR, ref domains, traffic, keywords) | Ahrefs API or DataForSEO | Paid | API key | Planned | New `HealthSource.fetch(siteUrl)`; action upserts `health_snapshots` |
| SEO Score (Rankmath /100) | Rankmath REST (WordPress only) | Free | site creds | Planned | New `SeoScoreSource`; per-site fetch → `seo_scores` |
| Backlinks | DataForSEO / Moz / Common Crawl | Free-limited / Paid | API key | Planned | New `BacklinkSource`; bulk insert `backlinks` |
| Analytics (comparison) | GA4 Data API | Free | OAuth | Pending structure | Section is inert until its structure is supplied |
| QA checklist | Playwright automated checks | Free | none | Planned (partial) | Headless checks per `qa_pages` × `qa_elements`; upsert `qa_checks` |

## The adapter contract
Add `XSource extends MetricSource` in `src/lib/sources/types.ts`, implement it in
`src/lib/sources/<name>.ts` (with `import "server-only"` and the pure parsing in a
separate `parse-*.ts` so it stays unit-testable), then call it from a `requireAdmin`-gated
Server Action that upserts into the section's table on its unique key.

## Cron activation
Vercel Cron hits a Route Handler on a schedule. Guard the route with a `CRON_SECRET`
header check. Locally, a cron can be simulated by calling the route directly.
