-- Next Step production foundation. Apply with `supabase db push`.
create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('job_seeker','employer','moderator','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.job_status as enum ('draft','pending_review','published','closed','expired','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.work_mode as enum ('on_site','hybrid','remote'); exception when duplicate_object then null; end $$;
do $$ begin create type public.job_report_status as enum ('open','reviewing','resolved','dismissed'); exception when duplicate_object then null; end $$;

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, role public.user_role not null default 'job_seeker', full_name text, avatar_url text, headline text, bio text, phone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.companies (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict, name text not null check (length(trim(name)) between 2 and 160), slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), description text, website_url text check (website_url is null or website_url ~ '^https://[^[:space:]]+$'), logo_url text check (logo_url is null or logo_url ~ '^https://[^[:space:]]+$'), location text, is_verified boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), description text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.jobs (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict, category_id uuid references public.categories(id) on delete set null, created_by uuid not null references public.profiles(id) on delete restrict, title text not null check (length(trim(title)) between 3 and 200), slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), description text not null, requirements text[] not null default '{}', location text, employment_type text, work_mode public.work_mode not null default 'on_site', apply_url text not null check (apply_url ~ '^https://[^[:space:]]+$'), salary_min numeric(12,2) check (salary_min is null or salary_min >= 0), salary_max numeric(12,2) check (salary_max is null or salary_max >= salary_min), currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'), status public.job_status not null default 'pending_review', expires_at timestamptz, approved_by uuid references public.profiles(id) on delete set null, approved_at timestamptz, rejection_reason text, is_featured boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (approved_at is null or approved_by is not null));
create table public.saved_jobs (user_id uuid not null references public.profiles(id) on delete cascade, job_id uuid not null references public.jobs(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id,job_id));
create table public.job_alerts (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, name text not null check (length(trim(name)) between 1 and 120), keywords text, category_id uuid references public.categories(id) on delete set null, location text, work_mode public.work_mode, is_active boolean not null default true, last_notified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.job_reports (id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade, reporter_id uuid not null references public.profiles(id) on delete cascade, reason text not null check (length(trim(reason)) between 3 and 1000), status public.job_report_status not null default 'open', reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(job_id,reporter_id));
create table public.job_views (id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade, viewer_id uuid references public.profiles(id) on delete set null, visitor_hash text, created_at timestamptz not null default now(), check (viewer_id is not null or visitor_hash is not null));
create table public.job_clicks (id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade, user_id uuid references public.profiles(id) on delete set null, visitor_hash text, target text not null default 'apply', created_at timestamptz not null default now(), check (user_id is not null or visitor_hash is not null));
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null, action text not null, table_name text not null, record_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz not null default now());

-- Service-role/postgres bootstrap jobs have no auth.uid().  Do not make a caller
-- admin merely by trusting a client claim; only trusted database roles bypass RLS.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select case when session_user in ('postgres','supabase_admin','service_role') then true
    else exists(select 1 from public.profiles where id=auth.uid() and role='admin') end
$$;
create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.updated_at=now(); return new; end $$;

create or replace function public.guard_profile_role() returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- BEFORE is intentional: authorization is based on OLD role, never a newly
  -- assigned role. Trusted SQL bootstrap is allowed without auth.uid().
  if new.role is distinct from old.role then
    if session_user not in ('postgres','supabase_admin','service_role') and not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
      raise exception 'only admins may change roles';
    end if;
    insert into public.audit_logs(actor_id,action,table_name,record_id,old_data,new_data)
      values(auth.uid(),'role_change','profiles',new.id,jsonb_build_object('role',old.role),jsonb_build_object('role',new.role));
  end if;
  return new;
end $$;
create or replace function public.guard_company_identity() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() and (new.owner_id is distinct from old.owner_id or new.name is distinct from old.name or new.slug is distinct from old.slug or new.is_verified is distinct from old.is_verified) then
    raise exception 'company identity and verification are admin managed';
  end if;
  return new;
end $$;
create or replace function public.guard_job_moderation() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' and not public.is_admin() and (new.status is distinct from 'pending_review' or new.approved_by is not null or new.approved_at is not null or new.rejection_reason is not null or new.is_featured) then
    raise exception 'job moderation fields are admin managed';
  elsif tg_op='UPDATE' and not public.is_admin() and (new.status is distinct from old.status or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at or new.rejection_reason is distinct from old.rejection_reason or new.is_featured is distinct from old.is_featured) then
    raise exception 'job moderation fields are admin managed';
  end if;
  return new;
end $$;
create or replace function public.guard_report_submission() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' and not public.is_admin() and (new.status is distinct from 'open' or new.reviewed_by is not null or new.reviewed_at is not null) then raise exception 'report moderation fields are admin managed'; end if;
  return new;
end $$;

-- This generic audit function only serializes whole records; it never dereferences
-- table-specific fields (and therefore is safe for profiles, jobs, and deletes).
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path=public as $$
declare old_json jsonb; new_json jsonb; rid uuid;
begin
  if tg_op <> 'INSERT' then old_json := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_json := to_jsonb(new); end if;
  rid := coalesce((new_json->>'id')::uuid, (old_json->>'id')::uuid);
  insert into public.audit_logs(actor_id,action,table_name,record_id,old_data,new_data) values(auth.uid(),lower(tg_op),tg_table_name,rid,old_json,new_json);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create or replace function public.create_profile_for_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_user();
do $b$ declare t text; begin foreach t in array array['profiles','companies','categories','jobs','job_alerts','job_reports'] loop execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_'||t||'_updated_at',t); end loop; end $b$;
create trigger guard_profile_role before update of role on public.profiles for each row execute function public.guard_profile_role();
create trigger guard_company_identity before update on public.companies for each row execute function public.guard_company_identity();
create trigger guard_job_moderation before insert or update on public.jobs for each row execute function public.guard_job_moderation();
create trigger guard_report_submission before insert on public.job_reports for each row execute function public.guard_report_submission();
do $b$ declare t text; begin foreach t in array array['profiles','companies','categories','jobs','job_alerts','job_reports'] loop execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t); end loop; end $b$;

create index jobs_public_idx on public.jobs(status,expires_at desc,created_at desc) where status='published';
create index jobs_company_idx on public.jobs(company_id,status); create index jobs_category_idx on public.jobs(category_id,status); create index jobs_creator_idx on public.jobs(created_by,status); create index job_reports_status_idx on public.job_reports(status,created_at desc); create index job_reports_job_idx on public.job_reports(job_id); create index job_views_job_idx on public.job_views(job_id,created_at desc); create index job_clicks_job_idx on public.job_clicks(job_id,created_at desc); create index audit_logs_record_idx on public.audit_logs(table_name,record_id,created_at desc);

do $$ declare t text; begin foreach t in array array['profiles','companies','categories','jobs','saved_jobs','job_alerts','job_reports','job_views','job_clicks','audit_logs'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public, anon, authenticated',t); end loop; end $$;
grant select on public.profiles,public.companies,public.categories,public.jobs to anon,authenticated;
grant insert on public.companies,public.jobs,public.saved_jobs,public.job_alerts,public.job_reports to authenticated;
grant select,delete on public.companies to authenticated; grant update (description,website_url,logo_url,location) on public.companies to authenticated;
grant select,update,delete on public.saved_jobs,public.job_alerts to authenticated; grant update (full_name,avatar_url,headline,bio,phone) on public.profiles to authenticated; grant update (role) on public.profiles to authenticated;
grant insert,update,delete on public.categories to authenticated; grant select,update,delete on public.jobs,public.job_reports to authenticated; grant select on public.job_views,public.job_clicks to authenticated;

create policy profiles_read on public.profiles for select to anon,authenticated using (id=auth.uid() or public.is_admin()); create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid()); create policy profiles_admin_update on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy companies_read on public.companies for select to anon,authenticated using (owner_id=auth.uid() or public.is_admin() or exists(select 1 from public.jobs j where j.company_id=companies.id and j.status='published' and (j.expires_at is null or j.expires_at>now())));
create policy companies_insert on public.companies for insert to authenticated with check(owner_id=auth.uid()); create policy companies_update on public.companies for update to authenticated using(owner_id=auth.uid() or public.is_admin()) with check(owner_id=auth.uid() or public.is_admin()); create policy companies_admin_delete on public.companies for delete to authenticated using(public.is_admin());
create policy categories_read on public.categories for select to anon,authenticated using(is_active or public.is_admin()); create policy categories_admin_insert on public.categories for insert to authenticated with check(public.is_admin()); create policy categories_admin_update on public.categories for update to authenticated using(public.is_admin()) with check(public.is_admin()); create policy categories_admin_delete on public.categories for delete to authenticated using(public.is_admin());
create policy jobs_read on public.jobs for select to anon,authenticated using((status='published' and (expires_at is null or expires_at>now())) or created_by=auth.uid() or public.is_admin());
create policy jobs_submit on public.jobs for insert to authenticated with check(created_by=auth.uid() and status='pending_review' and approved_by is null and approved_at is null and rejection_reason is null and is_featured=false and exists(select 1 from public.companies c where c.id=company_id and c.owner_id=auth.uid())); create policy jobs_admin_update on public.jobs for update to authenticated using(public.is_admin()) with check(public.is_admin()); create policy jobs_admin_delete on public.jobs for delete to authenticated using(public.is_admin());
create policy saved_jobs_own_read on public.saved_jobs for select to authenticated using(user_id=auth.uid()); create policy saved_jobs_own_insert on public.saved_jobs for insert to authenticated with check(user_id=auth.uid()); create policy saved_jobs_own_delete on public.saved_jobs for delete to authenticated using(user_id=auth.uid());
create policy alerts_own_read on public.job_alerts for select to authenticated using(user_id=auth.uid()); create policy alerts_own_insert on public.job_alerts for insert to authenticated with check(user_id=auth.uid()); create policy alerts_own_update on public.job_alerts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); create policy alerts_own_delete on public.job_alerts for delete to authenticated using(user_id=auth.uid());
create policy reports_insert on public.job_reports for insert to authenticated with check(reporter_id=auth.uid() and status='open' and reviewed_by is null and reviewed_at is null); create policy reports_admin_insert on public.job_reports for insert to authenticated with check(public.is_admin()); create policy reports_admin_read on public.job_reports for select to authenticated using(public.is_admin()); create policy reports_admin_update on public.job_reports for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy views_admin_read on public.job_views for select to authenticated using(public.is_admin()); create policy clicks_admin_read on public.job_clicks for select to authenticated using(public.is_admin()); create policy audit_admin_read on public.audit_logs for select to authenticated using(public.is_admin());

insert into storage.buckets(id,name,public) values('avatars','avatars',true),('job-assets','job-assets',false) on conflict(id) do nothing;
drop policy if exists avatars_read on storage.objects; drop policy if exists avatars_insert on storage.objects; drop policy if exists avatars_update on storage.objects; drop policy if exists avatars_delete on storage.objects; drop policy if exists job_assets_read on storage.objects; drop policy if exists job_assets_insert on storage.objects; drop policy if exists job_assets_update on storage.objects; drop policy if exists job_assets_delete on storage.objects;
create policy avatars_read on storage.objects for select to anon,authenticated using(bucket_id='avatars'); create policy avatars_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and coalesce((metadata->>'size')::bigint,0)<=5242880); create policy avatars_update on storage.objects for update to authenticated using(bucket_id='avatars' and owner_id=auth.uid()::text) with check(bucket_id='avatars' and owner_id=auth.uid()::text and lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and coalesce((metadata->>'size')::bigint,0)<=5242880); create policy avatars_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and owner_id=auth.uid()::text);
create policy job_assets_read on storage.objects for select to authenticated using(bucket_id='job-assets' and (owner_id=auth.uid()::text or public.is_admin())); create policy job_assets_insert on storage.objects for insert to authenticated with check(bucket_id='job-assets' and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png','webp') and coalesce((metadata->>'size')::bigint,0)<=10485760); create policy job_assets_update on storage.objects for update to authenticated using(bucket_id='job-assets' and owner_id=auth.uid()::text) with check(bucket_id='job-assets' and owner_id=auth.uid()::text and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png','webp') and coalesce((metadata->>'size')::bigint,0)<=10485760); create policy job_assets_delete on storage.objects for delete to authenticated using(bucket_id='job-assets' and (owner_id=auth.uid()::text or public.is_admin()));
