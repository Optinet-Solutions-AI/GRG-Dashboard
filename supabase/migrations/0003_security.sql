-- is_admin() authorization helper
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile (role 'viewer') whenever an auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS + policies. Pattern: read for any authenticated user; write for admins only.
do $$
declare t text;
begin
  foreach t in array array[
    'sites','keywords','countries','pagespeed_urls','qa_pages','qa_elements',
    'seo_scores','health_snapshots','pagespeed_entries','rankings',
    'keyword_volumes','backlinks','qa_checks'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "read_authenticated" on public.%I for select to authenticated using (true);$f$, t);
    execute format($f$create policy "admin_insert" on public.%I for insert to authenticated with check (public.is_admin());$f$, t);
    execute format($f$create policy "admin_update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin());$f$, t);
    execute format($f$create policy "admin_delete" on public.%I for delete to authenticated using (public.is_admin());$f$, t);
  end loop;
end $$;

-- profiles: a user can read their own profile; admins can read all. No client-side writes
-- (roles are set server-side with the service_role key, which bypasses RLS).
alter table public.profiles enable row level security;
create policy "profiles_read_self_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
