-- Transaction-based regression checks. Run in a disposable local Supabase DB:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f this-file.sql
begin;
set local role postgres;
do $$
declare
begin
  -- Structural assertions catch the high-risk policy/trigger regressions without
  -- requiring a particular JWT test harness.
  if not exists (select 1 from pg_trigger where tgname='guard_profile_role') then raise exception 'missing BEFORE role guard'; end if;
  if not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and confdeltype='r') then raise exception 'jobs company delete must restrict'; end if;
  if not exists (select 1 from pg_policies where tablename='companies' and policyname='companies_admin_delete') then raise exception 'non-admin company delete policy remains'; end if;
  if not exists (select 1 from pg_policies where tablename='job_reports' and policyname='reports_admin_insert') then raise exception 'missing admin report insert policy'; end if;
  if not exists (select 1 from pg_policies where tablename='job_views' and policyname='views_admin_read') then raise exception 'missing analytics grant/policy'; end if;
end $$;
rollback;
