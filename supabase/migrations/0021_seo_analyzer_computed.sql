-- A computed SEO score for the sites Rank Math can't reach.
--
-- .com runs WordPress, so its Passed/Warnings/Failed come from Rank Math's SEO Analyzer
-- and are entered by hand. .org (Next.js) and .net have no Rank Math and therefore had no
-- SEO score at all. The dashboard now computes an equivalent for those two by fetching the
-- homepage and running the same class of site-wide tests (src/lib/seo-analyzer).
--
-- Two columns, both about being able to trust the number later:
--   source   — which method produced the row, so a hand-entered Rank Math figure is never
--              silently compared against a computed one as if they were the same scale.
--   analysis — the full per-check breakdown, so any score on the page can be explained
--              ("why 91?") and a regression can be diffed against the previous run.
--
-- auto_seo_analysis is opt-in per site and stays FALSE for .com: the analyzer must not be
-- able to overwrite Rank Math's numbers.

alter table public.seo_scores
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'analyzer')),
  add column if not exists analysis jsonb;

comment on column public.seo_scores.source is
  'manual = typed in from Rank Math (.com); analyzer = computed by src/lib/seo-analyzer (.org/.net)';
comment on column public.seo_scores.analysis is
  'Per-check breakdown from the computed analyzer: {url, analyzedAt, score, checks[]}';

alter table public.sites
  add column if not exists auto_seo_analysis boolean not null default false;

comment on column public.sites.auto_seo_analysis is
  'When true the SEO score is computed by the built-in analyzer. False for WordPress sites whose score comes from Rank Math.';

-- The two non-WordPress sites opt in; .com is left alone deliberately.
update public.sites
   set auto_seo_analysis = true
 where domain in ('gulfrecoverygroup.org', 'gulfrecoverygroup.net');
