import "server-only";
import { q, q1 } from "@/lib/db";

export type KpiRange = 7 | 30 | 90 | 365;

export type KpiSummary = {
  orders: number;
  delivered: number;
  cancelled: number;
  gmvCents: number;
  revenueCents: number;
  refundsCents: number;
  avgDeliveryMinutes: number | null;
  onTimePct: number | null;
  repeatRatePct: number | null;
  activeCustomers: number;
  activeRunners: number;
  avgRating: number | null;
};

const NY = "'America/New_York'";

export async function kpiSummary(days: KpiRange): Promise<KpiSummary> {
  const r = await q1<KpiSummary>(
    `with o as (
       select * from public.orders where created_at >= now() - make_interval(days => $1) and status <> 'pending_payment'
     ),
     s as (select late_grace_minutes from public.pricing_settings where id = 1),
     cust as (select customer_id, count(*) filter (where status = 'delivered') as n from o group by customer_id)
     select
       (select count(*)::int from o) as orders,
       (select count(*)::int from o where status = 'delivered') as delivered,
       (select count(*)::int from o where status = 'cancelled') as cancelled,
       (select coalesce(sum(total_cents), 0)::int from o where status = 'delivered') as "gmvCents",
       (select coalesce(sum(amount_cents), 0)::int from public.ledger where kind = 'platform_fee' and created_at >= now() - make_interval(days => $1)) as "revenueCents",
       (select coalesce(-sum(amount_cents), 0)::int from public.ledger where kind = 'refund' and created_at >= now() - make_interval(days => $1)) as "refundsCents",
       (select avg(extract(epoch from (delivered_at - created_at)) / 60)::float8 from o where status = 'delivered' and scheduled_for is null) as "avgDeliveryMinutes",
       (select (100.0 * count(*) filter (where delivered_at <= eta + make_interval(mins => (select late_grace_minutes from s))) / nullif(count(*), 0))::float8
          from o where status = 'delivered' and eta is not null) as "onTimePct",
       (select (100.0 * count(*) filter (where n >= 2) / nullif(count(*) filter (where n >= 1), 0))::float8 from cust) as "repeatRatePct",
       (select count(distinct customer_id)::int from o) as "activeCustomers",
       (select count(distinct runner_id)::int from o where status = 'delivered') as "activeRunners",
       (select avg(stars)::float8 from public.ratings where created_at >= now() - make_interval(days => $1)) as "avgRating"`,
    [days],
  );
  return r!;
}

export async function ordersPerDay(days: KpiRange) {
  return q<{ day: string; orders: number; delivered: number; gmv_cents: number; revenue_cents: number }>(
    `with d as (
       select generate_series((now() at time zone ${NY})::date - ($1 - 1), (now() at time zone ${NY})::date, interval '1 day')::date as day
     )
     select to_char(d.day, 'YYYY-MM-DD') as day,
       count(o.id)::int as orders,
       count(o.id) filter (where o.status = 'delivered')::int as delivered,
       coalesce(sum(o.total_cents) filter (where o.status = 'delivered'), 0)::int as gmv_cents,
       coalesce(sum(o.platform_fee_cents) filter (where o.status = 'delivered' and o.late_refunded_at is null), 0)::int as revenue_cents
     from d left join public.orders o
       on (o.created_at at time zone ${NY})::date = d.day and o.status <> 'pending_payment'
     group by d.day order by d.day`,
    [days],
  );
}

export async function ordersPerWeek(days: KpiRange) {
  return q<{ week: string; orders: number; delivered: number }>(
    `select to_char(date_trunc('week', created_at at time zone ${NY}), 'YYYY-MM-DD') as week,
       count(*)::int as orders, count(*) filter (where status = 'delivered')::int as delivered
     from public.orders where created_at >= now() - make_interval(days => $1) and status <> 'pending_payment'
     group by 1 order by 1`,
    [days],
  );
}

export async function ordersByBuilding(days: KpiRange) {
  return q<{ name: string; orders: number; delivered: number; gmv_cents: number }>(
    `select b.name, count(o.id)::int as orders, count(o.id) filter (where o.status = 'delivered')::int as delivered,
       coalesce(sum(o.total_cents) filter (where o.status = 'delivered'), 0)::int as gmv_cents
     from public.buildings b left join public.orders o on o.building_id = b.id
       and o.created_at >= now() - make_interval(days => $1) and o.status <> 'pending_payment'
     group by b.id, b.name order by orders desc, b.name`,
    [days],
  );
}

export async function ordersBySpot(days: KpiRange) {
  return q<{ name: string; orders: number; delivered: number; gmv_cents: number }>(
    `select sp.name, count(o.id)::int as orders, count(o.id) filter (where o.status = 'delivered')::int as delivered,
       coalesce(sum(o.total_cents) filter (where o.status = 'delivered'), 0)::int as gmv_cents
     from public.pickup_spots sp left join public.orders o on o.spot_id = sp.id
       and o.created_at >= now() - make_interval(days => $1) and o.status <> 'pending_payment'
     group by sp.id, sp.name order by orders desc, sp.name`,
    [days],
  );
}

/** Orders by New York weekday (0 = Sunday) and hour. */
export async function peakHeatmap(days: KpiRange) {
  return q<{ dow: number; hour: number; orders: number }>(
    `select extract(dow from created_at at time zone ${NY})::int as dow,
       extract(hour from created_at at time zone ${NY})::int as hour, count(*)::int as orders
     from public.orders where created_at >= now() - make_interval(days => $1) and status <> 'pending_payment'
     group by 1, 2`,
    [days],
  );
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
