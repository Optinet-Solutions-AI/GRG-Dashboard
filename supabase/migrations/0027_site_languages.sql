-- Which keyword languages a site actually tracks.
--
-- .org and .net are Arabic-only. They picked up an English set purely because the OpenSEO
-- exports contained one and a site's first sweep adopts everything it returns, so an English
-- grid appeared for sites that were never meant to have one. Deleting those rows is not
-- enough: the next export would adopt them again.
--
-- .com keeps both — its English set is tracked deliberately.
alter table public.sites
  add column if not exists tracked_languages text[] not null default array['ar', 'en'];

comment on column public.sites.tracked_languages is
  'Keyword languages this site tracks. The importer drops export rows in any other language, and the ranking page hides the language toggle when only one is listed.';

update public.sites
   set tracked_languages = array['ar']
 where domain in ('gulfrecoverygroup.org', 'gulfrecoverygroup.net');
