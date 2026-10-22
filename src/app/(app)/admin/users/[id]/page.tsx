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
import { Avatar, KeyValue, Notice, PageHeader, SectionTitle, Tag } from "@/components/ui/misc";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "Admin · User" };
export const dynamic = "force-dynamic";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await loadProfile(id);
  if (!p) notFound();
  const [building, orders, strikes, runner, incidents] = await Promise.all([
    p.building_id ? getBuilding(p.building_id) : null,
    q<{ id: string; code: string; status: OrderStatus; total_cents: number; created_at: Date; role: string }>(
      `select id, code, status, total_cents, created_at, case when customer_id = $1 then 'customer' else 'runner' end as role
       from public.orders where customer_id = $1 or runner_id = $1 order by created_at desc limit 25`,
      [id],
    ),
    q<{ reason: string; note: string; voided: boolean; created_at: Date }>("select reason, note, voided, created_at from public.strikes where runner_id = $1 order by created_at desc", [id]),
    p.runner_status !== "none" ? earningsSummary(id) : null,
    q<{ type: string; role: string; created_at: Date; voided: boolean; pending: boolean; case_id: string | null }>(
      "select type, role, created_at, voided, pending, case_id from public.incidents where user_id = $1 order by created_at desc limit 30",
      [id],
    ),
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
              {p.flagged_at && <Tag tone="danger">Flagged</Tag>}
              {p.customer_review_required && <Tag tone="warning">Ordering paused</Tag>}
            </div>
          </div>
          {p.flagged_at && <Notice tone="danger" title="Flagged for review">{p.flag_reason ?? "Pattern of incidents."} Flagged {fmtDateTime(p.flagged_at)}.</Notice>}
          {p.customer_review_required && <Notice tone="warning" title="Ordering paused">Repeated no-shows. Clear the review to let them order again.</Notice>}
          <KeyValue
            items={[
              { k: "Email", v: p.email },
              { k: "Phone", v: formatPhone(p.phone) },
              { k: "Delivers to", v: `${building?.name ?? "n/a"}, floor ${p.floor}, room ${p.room}` },
              { k: "Dormdash credit", v: formatCents(p.credit_cents) },
              { k: "Joined", v: fmtDate(p.created_at) },
              { k: "Last login", v: lastSeen?.last_sign_in_at ? fmtDateTime(lastSeen.last_sign_in_at) : "n/a" },
              ...(runner
                ? [
                    { k: "Rating", v: runner.rating ? `${runner.rating.toFixed(2)} (${runner.ratings})` : "none" },
                    { k: "Lifetime earnings", v: formatCents(runner.lifetimeCents) },
                    { k: "Active strikes", v: String(runner.activeStrikes) },
                    { k: "Stripe payouts", v: p.payouts_enabled ? "Enabled" : p.stripe_account_id ? "Onboarding not finished" : "Not set up" },
                    { k: "Level offset (demotions)", v: String(p.level_offset) },
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
          {incidents.length > 0 && (
            <section>
              <SectionTitle>Incidents</SectionTitle>
              <ul className="divide-y divide-line text-small">
                {incidents.map((i, k) => (
                  <li key={k} className={`flex justify-between gap-3 py-2 ${i.voided ? "text-ink-3 line-through" : ""}`}>
                    <span>
                      <span className="font-semibold">{i.type.replace(/_/g, " ")}</span> as {i.role}
                      {i.pending ? " (pending)" : ""}
                      {i.case_id && <> · <a className="link" href={`/admin/cases/${i.case_id}`}>case</a></>}
                    </span>
                    <span className="tnum text-ink-3">{fmtDateTime(i.created_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
          <UserActions id={p.id} isAdmin={p.is_admin} status={p.status} runnerStatus={p.runner_status} hasStrikes={strikes.some((s) => !s.voided)} flagged={!!p.flagged_at} reviewRequired={p.customer_review_required} />
        </aside>
      </div>
    </div>
  );
}
