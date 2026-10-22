-- Dormdash schema. Runs on Supabase Postgres and on the local PGlite database
-- (the local bootstrap in scripts/local-bootstrap.sql stubs the auth schema first).
-- Money is always integer cents. Times are timestamptz (displayed in America/New_York).

-- ---------- enums ----------
create type public.runner_status as enum ('none', 'pending', 'approved', 'rejected', 'suspended');
create type public.account_status as enum ('active', 'suspended', 'deleted');
create type public.spot_type as enum ('restaurant', 'cafe', 'convenience', 'dining_hall');
create type public.order_status as enum ('pending_payment', 'requested', 'claimed', 'picked_up', 'on_the_way', 'delivered', 'cancelled');
create type public.handoff_type as enum ('door', 'lobby');
create type public.photo_kind as enum ('avatar', 'id_card', 'confirmation', 'pickup', 'dropoff', 'dispute');
create type public.dispute_reason as enum ('late', 'missing', 'wrong_items', 'stolen', 'wrong_room', 'other');
create type public.dispute_status as enum ('open', 'runner_responded', 'resolved');
create type public.strike_reason as enum ('late', 'dispute', 'unclaim', 'manual');
create type public.application_status as enum ('pending', 'approved', 'rejected');

-- ---------- reference data ----------
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  floor_count int not null check (floor_count between 1 and 80),
  door_requires_resident boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pickup_spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  type public.spot_type not null default 'restaurant',
  active boolean not null default true,
  pickup_notes text not null default '',
  verify_before_launch boolean not null default true,
  created_at timestamptz not null default now()
);

-- Distance from each spot to each building, maintained by the app whenever a spot or
-- building changes. `enabled` can only be true while distance <= the max radius.
create table public.spot_building_distances (
  spot_id uuid not null references public.pickup_spots(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  distance_miles double precision not null,
  enabled boolean not null default true,
  primary key (spot_id, building_id)
);

-- ---------- people ----------
-- profiles.id equals auth.users.id. No FK to auth.users on purpose: deleting an account
-- removes the auth user but keeps an anonymized profile so order history stays intact.
create table public.profiles (
  id uuid primary key,
  email text,
  full_name text not null,
  phone text,
  building_id uuid references public.buildings(id),
  floor int,
  room text,
  avatar_path text,
  is_admin boolean not null default false,
  runner_status public.runner_status not null default 'none',
  runner_home_building_id uuid references public.buildings(id),
  status public.account_status not null default 'active',
  on_shift boolean not null default false,
  on_shift_since timestamptz,
  payout_email text,
  terms_accepted_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email)) where email is not null;
create unique index profiles_phone_key on public.profiles (phone) where phone is not null;

create table public.runner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  legal_name text not null,
  home_building_id uuid not null references public.buildings(id),
  id_photo_path text not null,
  agreement_accepted_at timestamptz not null,
  status public.application_status not null default 'pending',
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index runner_applications_user_idx on public.runner_applications (user_id, created_at desc);

-- ---------- settings ----------
create table public.pricing_settings (
  id int primary key default 1 check (id = 1),
  base_fee_cents int not null default 100,
  distance_tiers jsonb not null default '[{"maxMiles":0.05,"addCents":0},{"maxMiles":0.10,"addCents":50},{"maxMiles":0.20,"addCents":100},{"maxMiles":0.25,"addCents":150}]',
  floor_tiers jsonb not null default '[{"maxFloor":5,"addCents":0},{"maxFloor":10,"addCents":50},{"maxFloor":null,"addCents":100}]',
  max_radius_miles double precision not null default 0.25,
  weather_surge_on boolean not null default false,
  weather_multiplier double precision not null default 1.5,
  platform_fee_pct double precision not null default 0.25,
  cancel_fee_cents int not null default 50,
  late_grace_minutes int not null default 15,
  unclaimed_ping_minutes int not null default 10,
  unclaimed_cancel_minutes int not null default 20,
  strike_threshold int not null default 3,
  max_active_orders int not null default 4,
  free_unclaims_per_week int not null default 1,
  tip_presets int[] not null default '{0,50,100,200}',
  payout_hold_hours int not null default 24,
  min_payout_cents int not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

-- Minutes from midnight, New York time. end_minute < start_minute means the window
-- runs past midnight and belongs to the day it starts on. days: 0 = Sunday.
create table public.surge_windows (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  days int[] not null,
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 0 and 1440),
  multiplier double precision not null default 1.5 check (multiplier >= 1 and multiplier <= 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null default ''
);

create table public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- runner availability ----------
-- One row per weekly one-hour availability slot (New York time).
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_hour int not null check (start_hour between 0 and 23),
  created_at timestamptz not null default now(),
  unique (runner_id, day_of_week, start_hour)
);

-- ---------- orders ----------
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references public.profiles(id),
  runner_id uuid references public.profiles(id),
  batch_id uuid references public.batches(id),
  spot_id uuid not null references public.pickup_spots(id),
  building_id uuid not null references public.buildings(id),
  floor int not null,
  room text not null,
  pickup_name text not null,
  order_number text not null default '',
  notes text not null default '',
  status public.order_status not null default 'pending_payment',
  handoff public.handoff_type,
  scheduled_for timestamptz,
  -- pricing snapshot, computed server-side at checkout
  distance_miles double precision not null,
  base_fee_cents int not null,
  distance_fee_cents int not null,
  floor_fee_cents int not null,
  surge_multiplier double precision not null default 1,
  surge_fee_cents int not null default 0,
  delivery_fee_cents int not null,
  tip_cents int not null default 0,
  total_cents int not null,
  platform_fee_cents int not null,
  runner_fee_cents int not null,
  -- payment
  payment_provider text not null,
  payment_ref text,
  capture_ref text,
  payment_status text not null default 'pending',
  refunded_cents int not null default 0,
  -- lifecycle
  eta timestamptz,
  claimed_at timestamptz,
  picked_up_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  delivered_via text,
  pin_attempts int not null default 0,
  late_refunded_at timestamptz,
  runner_pinged_at timestamptz,
  cancel_prompted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_runner_idx on public.orders (runner_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at);

-- The handoff PIN lives apart from the order so runners, who can read the order row,
-- can never read the PIN.
create table public.order_secrets (
  order_id uuid primary key references public.orders(id) on delete cascade,
  pin text not null check (pin ~ '^[0-9]{4}$')
);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  type text not null,
  from_status public.order_status,
  to_status public.order_status,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, id);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  customer_id uuid not null references public.profiles(id),
  runner_id uuid references public.profiles(id),
  reason public.dispute_reason not null,
  description text not null,
  status public.dispute_status not null default 'open',
  runner_response text,
  runner_responded_at timestamptz,
  resolution_actions text[] not null default '{}',
  resolution_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index disputes_one_open_per_order on public.disputes (order_id) where status <> 'resolved';

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  dispute_id uuid references public.disputes(id) on delete cascade,
  kind public.photo_kind not null,
  bucket text not null,
  path text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index photos_order_idx on public.photos (order_id);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  customer_id uuid not null references public.profiles(id),
  runner_id uuid not null references public.profiles(id),
  stars int not null check (stars between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index ratings_runner_idx on public.ratings (runner_id);

create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id),
  reason public.strike_reason not null,
  order_id uuid references public.orders(id),
  note text not null default '',
  voided boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index strikes_runner_idx on public.strikes (runner_id) where not voided;

-- Unclaims are tracked separately so "repeated unclaims" can be counted per week.
create table public.unclaims (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id),
  order_id uuid not null references public.orders(id),
  created_at timestamptz not null default now()
);

-- ---------- money ----------
-- A payout is one transfer of a runner's available balance (PayPal Payouts or demo).
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id),
  amount_cents int not null,
  status text not null default 'pending',
  provider text not null,
  provider_ref text,
  receiver text,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Per-order earning lines for runners. Negative lines are clawbacks from disputes.
-- payout_id stays null until the line is included in a payout.
create table public.runner_earnings (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  kind text not null check (kind in ('delivery_fee', 'tip', 'cancellation_fee', 'adjustment')),
  amount_cents int not null,
  available_at timestamptz not null default now(),
  payout_id uuid references public.payouts(id),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index runner_earnings_runner_idx on public.runner_earnings (runner_id, created_at desc);

-- Every customer money movement: charges, refunds. Mirrors the provider.
create table public.ledger (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders(id),
  user_id uuid references public.profiles(id),
  kind text not null check (kind in ('charge', 'refund', 'platform_fee', 'payout')),
  amount_cents int not null,
  provider text not null,
  provider_ref text,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index ledger_order_idx on public.ledger (order_id);

-- ---------- notifications ----------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_order_updates boolean not null default true,
  push_new_jobs boolean not null default true,
  push_disputes boolean not null default true,
  push_account boolean not null default true,
  email_order_updates boolean not null default false,
  email_disputes boolean not null default true,
  email_account boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null default '',
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- infrastructure ----------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- ---------- auth.users -> profiles ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, phone, building_id, floor, room, terms_accepted_at)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(meta->>'full_name', ''), split_part(new.email, '@', 1)),
    nullif(meta->>'phone', ''),
    nullif(meta->>'building_id', '')::uuid,
    nullif(meta->>'floor', '')::int,
    nullif(meta->>'room', ''),
    case when meta->>'terms_accepted' = 'true' then now() end
  );
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_change after update of email on auth.users
  for each row execute function public.handle_user_email_change();
