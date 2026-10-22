-- Runs, food-for-PIN handoff, door proof, cases, incidents, credits, Guarantee Fund,
-- runner levels, bans. Ground rules: no drop-offs, no payout holds, no auth holds.

-- ---------- runs (was batches) ----------
alter table public.batches rename to runs;
alter policy batches_read on public.runs rename to runs_read;
alter table public.orders rename column batch_id to run_id;
alter table public.runs
  add column heading_home boolean not null default false,
  add column building_id uuid references public.buildings(id),
  add column heads_up_at timestamptz,
  add column closed_at timestamptz;

-- ---------- buildings ----------
alter table public.buildings add column handoff_radius_m int not null default 75 check (handoff_radius_m between 10 and 1000);

-- ---------- orders ----------
alter table public.orders
  add column food_value_cents int not null default 0 check (food_value_cents >= 0),
  add column food_total_flagged boolean not null default false,
  add column bags int not null default 1 check (bags between 1 and 4),
  add column bag_fee_cents int not null default 0,
  add column size_fee_cents int not null default 0,
  add column guarantee_cents int not null default 0,
  add column credit_applied_cents int not null default 0,
  add column charged_cents int not null default 0,
  add column floor_fee_refunded_cents int not null default 0,
  add column heads_up_at timestamptz,
  add column at_door_at timestamptz,
  add column door_photo_id uuid references public.photos(id),
  add column door_location text check (door_location in ('in_range', 'out_of_range', 'denied', 'unavailable')),
  add column door_distance_m double precision,
  add column countdown_ends_at timestamptz,
  add column customer_present_at timestamptz,
  add column runner_absent_case_at timestamptz,
  add column pin_entered_at timestamptz,
  add column no_show_at timestamptz,
  add column payout_review boolean not null default false,
  add column missing_notified_at timestamptz;
-- PIN is the only way to complete a delivery.
update public.orders set delivered_via = 'pin' where delivered_via is not null;
alter table public.orders add constraint orders_delivered_via_pin check (delivered_via is null or delivered_via = 'pin');

-- ---------- photos: server-stamped live-camera evidence ----------
alter table public.photos
  add column via_camera boolean not null default false,
  add column captured_at timestamptz,
  add column location_status text check (location_status in ('in_range', 'out_of_range', 'denied', 'unavailable')),
  add column distance_m double precision,
  add column deleted_at timestamptz;

-- One-time tokens issued when the in-app camera opens. Evidence uploads must carry one.
create table public.camera_tokens (
  token_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table public.call_logs (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  caller_id uuid not null references public.profiles(id),
  caller_role text not null check (caller_role in ('runner', 'customer')),
  created_at timestamptz not null default now()
);

create table public.heading_home_sessions (
  id bigint generated always as identity primary key,
  runner_id uuid not null references public.profiles(id),
  building_id uuid not null references public.buildings(id),
  location_status text not null,
  orders_shown int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- profiles ----------
alter table public.profiles
  add column credit_cents int not null default 0 check (credit_cents >= 0),
  add column use_credit boolean not null default true,
  add column stripe_account_id text,
  add column payouts_enabled boolean not null default false,
  add column level_offset int not null default 0,
  add column flagged_at timestamptz,
  add column flag_reason text,
  add column customer_review_required boolean not null default false,
  add column banned_at timestamptz;
alter table public.profiles drop column payout_email;
grant update (use_credit) on public.profiles to authenticated;

alter table public.runner_applications add column nyu_id_number text;

-- Identities that may never register again (confirmed theft).
create table public.blocked_identities (
  kind text not null check (kind in ('email', 'phone', 'nyu_id')),
  value text not null,
  reason text not null default '',
  case_id uuid,
  created_at timestamptz not null default now(),
  primary key (kind, value)
);

-- ---------- cases (replace disputes) ----------
-- Existing disputes become cases with the same id, so photos.dispute_id (renamed to
-- case_id below) still points at a real row and photos_case_id_fkey can be added.
create temp table legacy_disputes as
  select id, order_id, customer_id, runner_id, reason::text as reason, description, status::text as status,
    runner_response, runner_responded_at, resolution_note, resolved_by, resolved_at, created_at
  from public.disputes;
alter table public.photos drop constraint if exists photos_dispute_id_fkey;
drop table public.disputes;
drop type public.dispute_status;
drop type public.dispute_reason;
alter table public.photos rename column dispute_id to case_id;

create type public.case_type as enum ('missing_delivery', 'pin_no_food', 'runner_not_at_door', 'customer_claim', 'runner_problem');
create type public.case_status as enum ('open', 'under_review', 'resolved');

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  type public.case_type not null,
  priority int not null default 3 check (priority between 1 and 3), -- 1 top, 2 high, 3 normal
  status public.case_status not null default 'open',
  customer_id uuid not null references public.profiles(id),
  runner_id uuid references public.profiles(id),
  opened_by uuid references public.profiles(id),
  reason text not null default '',
  description text not null default '',
  auto_rejected boolean not null default false,
  runner_response text,
  runner_responded_at timestamptz,
  response_due_at timestamptz,
  outcome text,
  outcome_note text,
  refund_cash_cents int not null default 0,
  refund_credit_cents int not null default 0,
  refund_due_at timestamptz,
  refunded_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  appeal_text text,
  appeal_at timestamptz,
  appeal_decision text check (appeal_decision in ('upheld', 'overturned')),
  appeal_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_queue_idx on public.cases (status, priority, created_at);
create trigger cases_touch before update on public.cases for each row execute function public.touch_updated_at();
insert into public.cases (id, order_id, type, priority, status, customer_id, runner_id, opened_by, reason, description,
    runner_response, runner_responded_at, outcome_note, resolved_by, resolved_at, created_at)
  select id, order_id, 'customer_claim', 3,
    (case status when 'resolved' then 'resolved' when 'runner_responded' then 'under_review' else 'open' end)::public.case_status,
    customer_id, runner_id, customer_id, reason, description, runner_response, runner_responded_at, resolution_note, resolved_by, resolved_at, created_at
  from legacy_disputes;
drop table legacy_disputes;
-- Anything still dangling (shouldn't happen) is detached rather than blocking the migration.
update public.photos set case_id = null where case_id is not null and not exists (select 1 from public.cases c where c.id = case_id);
alter table public.photos add constraint photos_case_id_fkey foreign key (case_id) references public.cases(id) on delete cascade;

-- Per-party threads: customers and runners each talk only to Dormdash admins.
create table public.case_messages (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  party text not null check (party in ('customer', 'runner')),
  author_id uuid not null references public.profiles(id),
  from_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.incidents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('customer', 'runner')),
  type text not null,
  order_id uuid references public.orders(id),
  case_id uuid references public.cases(id),
  counterparty_id uuid references public.profiles(id),
  pending boolean not null default false, -- e.g. PIN-but-no-food: on both parties until resolved
  voided boolean not null default false,
  created_at timestamptz not null default now()
);
create index incidents_user_idx on public.incidents (user_id, created_at desc) where not voided;

create table public.law_enforcement_requests (
  id uuid primary key default gen_random_uuid(),
  agency text not null,
  officer text not null,
  reference text not null,
  request_date date not null,
  shared text not null,
  case_id uuid references public.cases(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- money ----------
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check check (kind in (
  'charge', 'refund', 'platform_fee', 'payout',
  'guarantee_in', 'guarantee_out', 'fund_shortfall', 'runner_deduction',
  'credit_issued', 'credit_redeemed'));

-- No payout holds. `held` is only for no-shows whose location couldn't be verified.
alter table public.runner_earnings add column held boolean not null default false;
update public.runner_earnings set available_at = created_at where available_at > created_at;

-- ---------- settings ----------
alter table public.pricing_settings
  drop column payout_hold_hours,
  drop column min_payout_cents,
  add column size_tiers jsonb not null default '[{"maxCents":1500,"addCents":0},{"maxCents":3000,"addCents":50},{"maxCents":5000,"addCents":100},{"maxCents":null,"addCents":150}]',
  add column bag_fee_cents int not null default 50,
  add column max_bags int not null default 4,
  add column guarantee_cents int not null default 10,
  add column door_countdown_seconds int not null default 180,
  add column runner_absent_grace_seconds int not null default 180,
  add column present_window_after_seconds int not null default 300,
  add column pin_claim_window_seconds int not null default 300,
  add column missing_delivery_minutes int not null default 45,
  add column heading_home_radius_miles double precision not null default 0.15,
  add column level_tiers jsonb not null default '[{"minDeliveries":0,"maxFoodCents":2000},{"minDeliveries":10,"maxFoodCents":4000},{"minDeliveries":30,"maxFoodCents":null}]',
  add column no_show_warn_count int not null default 2,
  add column no_show_review_count int not null default 3,
  add column no_show_window_days int not null default 30,
  add column pattern_window_days int not null default 60,
  add column pattern_counterparties int not null default 3,
  add column no_show_rate_pct int not null default 20,
  add column no_show_rate_min_orders int not null default 10,
  add column free_problem_reports_per_30d int not null default 1,
  add column case_response_hours int not null default 24,
  add column refund_target_hours int not null default 24,
  add column appeal_days int not null default 7,
  add column evidence_retention_days int not null default 90;

-- ---------- RLS for the new tables ----------
alter table public.camera_tokens enable row level security;
alter table public.call_logs enable row level security;
alter table public.heading_home_sessions enable row level security;
alter table public.blocked_identities enable row level security;
alter table public.cases enable row level security;
alter table public.case_messages enable row level security;
alter table public.incidents enable row level security;
alter table public.law_enforcement_requests enable row level security;

grant select on public.cases, public.case_messages, public.heading_home_sessions, public.call_logs, public.incidents, public.law_enforcement_requests to authenticated;

-- Cases: the two parties and admins. (Server views strip personal details; see services/cases.ts.)
create policy cases_read on public.cases for select to authenticated
  using (customer_id = auth.uid() or runner_id = auth.uid() or public.is_admin());
-- Each party sees only its own thread with admins.
create policy case_messages_read on public.case_messages for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.cases c where c.id = case_id and (
      (party = 'customer' and c.customer_id = auth.uid()) or (party = 'runner' and c.runner_id = auth.uid())))
  );
create policy heading_home_read on public.heading_home_sessions for select to authenticated using (runner_id = auth.uid() or public.is_admin());
create policy call_logs_read on public.call_logs for select to authenticated using (public.is_admin());
create policy incidents_read on public.incidents for select to authenticated using (public.is_admin());
create policy law_enforcement_read on public.law_enforcement_requests for select to authenticated using (public.is_admin());
-- camera_tokens, blocked_identities: no policies (server only).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cases;
  end if;
end $$;
