import type { Metadata } from "next";
import { q } from "@/lib/db";
import { ORDER_VIEW_SQL, type OrderView } from "@/lib/services/orders";
import { NoShowReview } from "./no-show-review";
import { listBuildings } from "@/lib/services/places";
import { STATUS_LABEL, type OrderStatus } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDateTime } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, Tag } from "@/components/ui/misc";
import { AdminCancel } from "./admin-cancel";

export const metadata: Metadata = { title: "Admin · Orders" };
export const dynamic = "force-dynamic";

const TONE: Partial<Record<OrderStatus, "success" | "warning" | "danger" | "accent">> = {
  delivered: "success",
  cancelled: "danger",
  requested: "warning",
  claimed: "accent",
  picked_up: "accent",
  on_the_way: "accent",
  customer_no_show: "warning",
};

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (sp.review) where.push("o.payout_review");
  if (sp.status) add("o.status = ?::public.order_status", sp.status);
  if (sp.building) add("o.building_id = ?::uuid", sp.building);
  if (sp.from) add("o.created_at >= ?::date", sp.from);
  if (sp.to) add("o.created_at < (?::date + 1)", sp.to);
  if (sp.q) {
    params.push(`%${sp.q.trim()}%`);
    const n = params.length;
    where.push(`(o.code ilike $${n} or c.full_name ilike $${n} or sp.name ilike $${n})`);
  }
  const orders = await q<OrderView & { customer_name: string; runner_name: string | null }>(`${ORDER_VIEW_SQL.replace("select o.*,", "select o.*, c.full_name as customer_name, r.full_name as runner_name,")} ${where.length ? "where " + where.join(" and ") : ""} order by o.created_at desc limit 200`, params);
  const buildings = await listBuildings({ includeInactive: true });

  return (
    <div className="pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Order log</h1>
      <form className="grid grid-cols-2 gap-3 border-y border-line py-4 md:grid-cols-6 md:items-end" method="get">
        <Input label="Search" name="q" defaultValue={sp.q ?? ""} placeholder="Code, customer, spot" fieldClassName="col-span-2" />
        <Select label="Status" name="status" defaultValue={sp.status ?? ""}>
          <option value="">Any</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select label="Building" name="building" defaultValue={sp.building ?? ""}>
          <option value="">Any</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.short_name}</option>)}
        </Select>
        <Input label="From" name="from" type="date" defaultValue={sp.from ?? ""} />
        <Input label="To" name="to" type="date" defaultValue={sp.to ?? ""} />
        <div className="col-span-2 flex gap-2 md:col-span-6">
          <Button type="submit" variant="ink" size="sm">Filter</Button>
          <a href="/admin/orders?review=1" className="inline-flex h-9 items-center px-3 text-small font-semibold text-ink-2 hover:text-ink">Held no-show payouts</a>
          <a href="/admin/orders" className="inline-flex h-9 items-center px-3 text-small font-semibold text-ink-2 hover:text-ink">Clear</a>
          <span className="tnum ml-auto self-center text-small text-ink-3">{orders.length}{orders.length === 200 ? "+" : ""} orders</span>
        </div>
      </form>

      {orders.length === 0 ? (
        <EmptyState title="No orders match">Loosen the filters or clear them.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-small">
            <thead>
              <tr className="border-b border-line text-left text-caption tracking-wide text-ink-3 uppercase">
                <th className="py-2 font-semibold">Code</th>
                <th className="py-2 font-semibold">Placed</th>
                <th className="py-2 font-semibold">Status</th>
                <th className="py-2 font-semibold">Customer</th>
                <th className="py-2 font-semibold">Runner</th>
                <th className="py-2 font-semibold">Spot → Dest</th>
                <th className="py-2 text-right font-semibold">Food</th>
                <th className="py-2 text-right font-semibold">Total</th>
                <th className="py-2 text-right font-semibold">Refunded</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="tnum divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="py-2.5 font-semibold">{o.code}</td>
                  <td className="py-2.5 whitespace-nowrap text-ink-2">{fmtDateTime(o.created_at)}</td>
                  <td className="py-2.5"><Tag tone={TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag>{o.late_refunded_at && <span className="ml-1 text-caption text-danger">late</span>}{o.payout_review && <span className="ml-1 text-caption text-danger">payout held</span>}{o.handoff === "lobby" && <span className="ml-1 text-caption text-ink-3">lobby</span>}</td>
                  <td className="py-2.5">{o.customer_name}</td>
                  <td className="py-2.5 text-ink-2">{o.runner_name ?? "none"}</td>
                  <td className="py-2.5 text-ink-2">{o.spot_name} → {o.building_short} {o.floor}/{o.room}</td>
                  <td className={`py-2.5 text-right ${o.food_total_flagged ? "font-semibold text-danger" : "text-ink-2"}`}>{formatCents(o.food_value_cents)}{o.food_total_flagged ? " ⚑" : ""}</td>
                  <td className="py-2.5 text-right">{formatCents(o.total_cents)}</td>
                  <td className="py-2.5 text-right text-ink-2">{o.refunded_cents ? formatCents(o.refunded_cents) : ""}</td>
                  <td className="py-2.5 text-right">
                    {["pending_payment", "requested", "claimed", "picked_up", "on_the_way"].includes(o.status) && <AdminCancel id={o.id} code={o.code} />}
                    {o.payout_review && <NoShowReview id={o.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
