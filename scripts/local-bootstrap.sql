-- Local-only bootstrap. Recreates the small slice of Supabase that FloorDrop's
-- migrations depend on (roles, auth.users, auth.uid()) so the exact same migrations
-- and RLS policies run inside PGlite. Never run this against Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text not null,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}',
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists auth_users_email_key on auth.users (lower(email));

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- Local auth: sessions and one-time tokens (signup, recovery, email_change).
create schema if not exists local;
create table if not exists local.sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists local.auth_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  new_email text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
-- Dev outbox: every email the app would send, so you (and the e2e tests) can click links.
create table if not exists local.outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  html text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create table if not exists local.migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
