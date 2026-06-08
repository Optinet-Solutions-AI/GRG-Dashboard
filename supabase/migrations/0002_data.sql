-- Time-series + snapshot data tables

create table public.seo_scores (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  date date not null,
  rankmath_analyzer integer check (rankmath_analyzer between 0 and 100),
  seo_homepage integer check (seo_homepage between 0 and 100),
  health_score integer check (health_score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (site_id, date)
);

create table public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  date date not null,
  domain_rating integer,
  referring_domains integer,
  total_visitors bigint,
  organic_traffic bigint,
  organic_keywords bigint,
  screenshot_path text,
  created_at timestamptz not null default now(),
  unique (site_id, date)
);

create table public.pagespeed_entries (
  id uuid primary key default gen_random_uuid(),
  pagespeed_url_id uuid not null references public.pagespeed_urls(id) on delete cascade,
  date date not null,
  mobile_score integer check (mobile_score between 0 and 100),
  desktop_score integer check (desktop_score between 0 and 100),
  mobile_screenshot_path text,
  desktop_screenshot_path text,
  created_at timestamptz not null default now(),
  unique (pagespeed_url_id, date)
);

create table public.rankings (
  id uuid primary key default gen_random_uuid(),
  week_date date not null,
  site_id uuid not null references public.sites(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  position integer check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique (week_date, site_id, country_id, keyword_id)
);
create index rankings_lookup on public.rankings (site_id, country_id, keyword_id, week_date);

create table public.keyword_volumes (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  volume integer,
  unique (keyword_id, country_id)
);

create table public.backlinks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  date date not null,
  source_site text,
  source_url text,
  anchor_text text,
  target_url text,
  created_at timestamptz not null default now()
);
create index backlinks_site_date on public.backlinks (site_id, date);

create table public.qa_checks (
  id uuid primary key default gen_random_uuid(),
  qa_page_id uuid not null references public.qa_pages(id) on delete cascade,
  qa_element_id uuid not null references public.qa_elements(id) on delete cascade,
  passed boolean not null,
  last_checked_at timestamptz,
  unique (qa_page_id, qa_element_id)
);
