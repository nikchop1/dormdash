import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { loadProfile } from "@/lib/auth/session";
import { getBuilding } from "@/lib/services/places";
import { earningsSummary } from "@/lib/services/runners";
import { avatarUrl } from "@/lib/storage";
import { STATUS_LABEL, type OrderStatus } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDate, fmtDateTime } from "@/lib/domain/time";
import { formatPhone } from "@/lib/validation";
import { Avatar, KeyValue, PageHeader, SectionTitle, Tag } from "@/components/ui/misc";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "Admin · User" };

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await loadProfile(id);
  if (!p) notFound();
  const [building, orders, strikes, runner] = await Promise.all([
    p.building_id ? getBuilding(p.building_id) : null,
    q<{ id: string; code: string; status: OrderStatus; total_cents: number; created_at: Date; role: string }>(
      `select id, code, status, total_cents, created_at, case when customer_id = $1 then 'customer' else 'runner' end as role
       from public.orders where customer_id = $1 or runner_id = $1 order by created_at desc limit 25`,
      [id],
    ),
    q<{ reason: string; note: string; voided: boolean; created_at: Date }>("select reason, note, voided, created_at from public.strikes where runner_id = $1 order by created_at desc", [id]),
    p.runner_status !== "none" ? earningsSummary(id) : null,
  ]);
  const lastSeen = await q1<{ last_sign_in_at: Date | null }>("select last_sign_in_at from auth.users where id = $1", [id]).catch(() => null);

  return (
    <div className="pb-10">
      <PageHeader back={{ href: "/admin/users", label: "Users" }} title={p.full_name} />
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Avatar src={avatarUrl(p.avatar_path)} name={p.full_name} size={64} />
            <div className="flex flex-wrap gap-1">
              {p.is_admin && <Tag tone="accent">Admin</Tag>}
              <Tag tone={p.status === "active" ? "success" : "danger"}>Account {p.status}</Tag>
              {p.runner_status !== "none" && <Tag>Runner: {p.runner_status}</Tag>}
            </div>
          </div>
          <KeyValue
            items={[
              { k: "Email", v: p.email },
              { k: "Phone", v: formatPhone(p.phone) },
              { k: "Delivers to", v: `${building?.name ?? "n/a"}, floor ${p.floor}, room ${p.room}` },
              { k: "Joined", v: fmtDate(p.created_at) },
              { k: "Last login", v: lastSeen?.last_sign_in_at ? fmtDateTime(lastSeen.last_sign_in_at) : "n/a" },
              ...(runner
                ? [
                    { k: "Rating", v: runner.rating ? `${runner.rating.toFixed(2)} (${runner.ratings})` : "none" },
                    { k: "Lifetime earnings", v: formatCents(runner.lifetimeCents) },
                    { k: "Active strikes", v: String(runner.activeStrikes) },
                    { k: "Payout email", v: p.payout_email ?? "not set" },
                  ]
                : []),
            ]}
          />
          <section>
            <SectionTitle>Recent orders</SectionTitle>
            <table className="w-full text-small">
              <tbody className="tnum divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 font-semibold"><a className="link" href={`/admin/orders?q=${o.code}`}>{o.code}</a></td>
                    <td className="py-2 text-ink-2">{o.role}</td>
                    <td className="py-2">{STATUS_LABEL[o.status]}</td>
                    <td className="py-2 text-ink-2">{fmtDateTime(o.created_at)}</td>
                    <td className="py-2 text-right">{formatCents(o.total_cents)}</td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td className="py-3 text-ink-3">No orders.</td></tr>}
              </tbody>
            </table>
          </section>
          {strikes.length > 0 && (
            <section>
              <SectionTitle>Strikes</SectionTitle>
              <ul className="divide-y divide-line text-small">
                {strikes.map((s, i) => (
                  <li key={i} className={`py-2 ${s.voided ? "text-ink-3 line-through" : ""}`}>
                    <span className="font-semibold capitalize">{s.reason}</span> · {fmtDate(s.created_at)}{s.note ? ` · ${s.note}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside>
          <SectionTitle>Actions</SectionTitle>
          <UserActions id={p.id} isAdmin={p.is_admin} status={p.status} runnerStatus={p.runner_status} hasStrikes={strikes.some((s) => !s.voided)} />
        </aside>
      </div>
    </div>
  );
}
