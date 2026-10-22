-- Row Level Security. Every table has RLS enabled. Clients (the browser Supabase
-- client used for realtime) only ever get SELECT plus a few narrow self-service
-- updates. All other writes go through server routes that check permissions
-- explicitly and use the privileged connection.

-- ---------- helpers (security definer so policies don't recurse into profiles) ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin and status = 'active'
  );
$$;

create or replace function public.is_runner_on_shift() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and runner_status = 'approved' and on_shift and status = 'active'
  );
$$;

create or replace function public.shares_order_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where (o.customer_id = auth.uid() and o.runner_id = other)
       or (o.runner_id = auth.uid() and o.customer_id = other)
  );
$$;

create or replace function public.can_see_order(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = oid
      and (
        o.customer_id = auth.uid()
        or o.runner_id = auth.uid()
        or (o.status = 'requested' and public.is_runner_on_shift())
        or public.is_admin()
      )
  );
$$;

grant execute on function public.is_admin(), public.is_runner_on_shift(),
  public.shares_order_with(uuid), public.can_see_order(uuid) to authenticated;

-- ---------- enable RLS everywhere ----------
alter table public.buildings enable row level security;
alter table public.pickup_spots enable row level security;
alter table public.spot_building_distances enable row level security;
alter table public.profiles enable row level security;
alter table public.runner_applications enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.surge_windows enable row level security;
alter table public.feature_flags enable row level security;
alter table public.app_state enable row level security;
alter table public.shifts enable row level security;
alter table public.batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_secrets enable row level security;
alter table public.order_events enable row level security;
alter table public.disputes enable row level security;
alter table public.photos enable row level security;
alter table public.ratings enable row level security;
alter table public.strikes enable row level security;
alter table public.unclaims enable row level security;
alter table public.payouts enable row level security;
alter table public.runner_earnings enable row level security;
alter table public.ledger enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.rate_limits enable row level security;

-- ---------- grants: anon gets nothing; authenticated gets read + narrow writes ----------
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
revoke select on public.rate_limits, public.app_state from authenticated;
grant update (full_name, phone, building_id, floor, room, avatar_path) on public.profiles to authenticated;
grant update (push_order_updates, push_new_jobs, push_disputes, push_account,
  email_order_updates, email_disputes, email_account) on public.notification_preferences to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert, delete on public.shifts to authenticated;
grant insert, delete on public.push_subscriptions to authenticated;

-- ---------- reference data: any signed-in user can read ----------
create policy buildings_read on public.buildings for select to authenticated using (active or public.is_admin());
create policy spots_read on public.pickup_spots for select to authenticated using (active or public.is_admin());
create policy distances_read on public.spot_building_distances for select to authenticated using (true);
create policy pricing_read on public.pricing_settings for select to authenticated using (true);
create policy surge_read on public.surge_windows for select to authenticated using (true);
create policy flags_read on public.feature_flags for select to authenticated using (true);

-- ---------- profiles ----------
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_order_with(id));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- runner applications ----------
create policy applications_read on public.runner_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- shifts ----------
create policy shifts_read on public.shifts for select to authenticated
  using (runner_id = auth.uid() or public.is_admin());
create policy shifts_insert on public.shifts for insert to authenticated
  with check (runner_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.runner_status = 'approved'));
create policy shifts_delete on public.shifts for delete to authenticated
  using (runner_id = auth.uid());

-- ---------- orders ----------
-- Customers: own orders. Runners: their claimed orders, plus open jobs while approved
-- and on shift. Admins: everything.
create policy orders_read on public.orders for select to authenticated
  using (
    customer_id = auth.uid()
    or runner_id = auth.uid()
    or (status = 'requested' and public.is_runner_on_shift())
    or public.is_admin()
  );

create policy order_secrets_read on public.order_secrets for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
         or public.is_admin());

create policy order_events_read on public.order_events for select to authenticated
  using (public.can_see_order(order_id));

create policy batches_read on public.batches for select to authenticated
  using (runner_id = auth.uid() or public.is_admin());

create policy photos_read on public.photos for select to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_admin()
    or (order_id is not null and exists (
      select 1 from public.orders o where o.id = order_id
        and (o.customer_id = auth.uid() or o.runner_id = auth.uid())))
  );

create policy ratings_read on public.ratings for select to authenticated
  using (customer_id = auth.uid() or runner_id = auth.uid() or public.is_admin());

create policy disputes_read on public.disputes for select to authenticated
  using (customer_id = auth.uid() or runner_id = auth.uid() or public.is_admin());

create policy strikes_read on public.strikes for select to authenticated
  using (runner_id = auth.uid() or public.is_admin());

create policy unclaims_read on public.unclaims for select to authenticated
  using (runner_id = auth.uid() or public.is_admin());

-- ---------- money ----------
create policy payouts_read on public.payouts for select to authenticated
  using (runner_id = auth.uid() or public.is_admin());
create policy earnings_read on public.runner_earnings for select to authenticated
  using (runner_id = auth.uid() or public.is_admin());
create policy ledger_read on public.ledger for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- notifications ----------
create policy prefs_read on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());
create policy prefs_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- rate_limits and app_state: RLS on, no policies. Server only.

-- ---------- realtime + storage (Supabase only; skipped locally) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.notifications, public.order_events;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute $q$
      insert into storage.buckets (id, name, public) values
        ('avatars', 'avatars', true),
        ('id-photos', 'id-photos', false),
        ('order-photos', 'order-photos', false)
      on conflict (id) do nothing
    $q$;
  end if;
end $$;
