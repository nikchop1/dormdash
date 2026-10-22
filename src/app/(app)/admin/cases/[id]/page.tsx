import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { getOrderView, orderEvents } from "@/lib/services/orders";
import { orderPhotos } from "@/lib/services/photos";
import { CASE_LABEL, OUTCOME_LABEL, type CaseOutcome, type CaseRow } from "@/lib/services/cases";
import { STATUS_LABEL } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDateTime, fmtTime } from "@/lib/domain/time";
import { cn } from "@/lib/cn";
import { KeyValue, Notice, PageHeader, SectionTitle, Tag } from "@/components/ui/misc";
import { AdminThread, AppealDecision, FlagTotal, ResolveCase } from "./case-admin-forms";

export const metadata: Metadata = { title: "Admin · Case" };
export const dynamic = "force-dynamic";

const PHOTO_LABEL: Record<string, string> = {
  confirmation: "Customer's receipt",
  pickup: "Bag at pickup",
  door: "Bag at the door",
  problem: "Runner's problem photo",
  case: "Case photo",
};
const LOCATION_LABEL: Record<string, string> = { in_range: "Location verified", out_of_range: "Out of range", denied: "Location denied", unavailable: "Location unavailable" };

const EVENT_LABEL: Record<string, string> = {
  pin_ok: "PIN entered correctly",
  heads_up: "Heads-up sent to customer",
  at_door: "Runner tapped at door",
  customer_present: "Customer tapped “I'm at my door”",
  no_show: "Runner marked customer not here",
  late_refund: "Late: fee auto-refunded",
  floor_fee_refunded: "Lobby handoff: floor fee refunded",
  case_opened: "Case opened",
  case_resolved: "Case resolved",
};

type Incident = { type: string; created_at: Date; pending: boolean; voided: boolean; code: string | null };
type Message = { party: "customer" | "runner"; from_admin: boolean; body: string; created_at: Date };

async function history(userId: string | null) {
  if (!userId) return null;
  return q1<{ name: string; email: string; phone: string | null; deliveries: number; orders: number; strikes: number; flagged_at: Date | null; flag_reason: string | null; status: string }>(
    `select p.full_name as name, p.email, p.phone, p.flagged_at, p.flag_reason, p.status,
       (select count(*)::int from public.orders where runner_id = p.id and status = 'delivered') as deliveries,
       (select count(*)::int from public.orders where customer_id = p.id and status <> 'pending_payment') as orders,
       (select count(*)::int from public.strikes where runner_id = p.id and not voided) as strikes
     from public.profiles p where p.id = $1`,
    [userId],
  );
}

const incidentsFor = (userId: string | null) =>
  userId
    ? q<Incident>(
        `select i.type, i.created_at, i.pending, i.voided, o.code from public.incidents i left join public.orders o on o.id = i.order_id
         where i.user_id = $1 order by i.created_at desc limit 20`,
        [userId],
      )
    : Promise.resolve([] as Incident[]);

export default async function AdminCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await q1<CaseRow>("select * from public.cases where id = $1", [id]);
  if (!c) notFound();
  const db = { query: q };
  const [o, events, photos, calls, messages, customer, runner, custIncidents, runIncidents] = await Promise.all([
    getOrderView(db, c.order_id),
    orderEvents(db, c.order_id),
    orderPhotos(c.order_id),
    q<{ caller_role: string; created_at: Date }>("select caller_role, created_at from public.call_logs where order_id = $1 order by created_at", [c.order_id]),
    q<Message>("select party, from_admin, body, created_at from public.case_messages where case_id = $1 order by created_at", [c.id]),
    history(c.customer_id),
    history(c.runner_id),
    incidentsFor(c.customer_id),
    incidentsFor(c.runner_id),
  ]);
  if (!o) notFound();

  const timeline = [
    { label: "Order placed", at: o.created_at },
    { label: "Claimed", at: o.claimed_at },
    { label: "Picked up", at: o.picked_up_at },
    { label: "Heads-up sent", at: o.heads_up_at },
    { label: `At door (${o.door_location ? LOCATION_LABEL[o.door_location] : "no location"}${o.door_distance_m !== null ? `, ${o.door_distance_m} m` : ""})`, at: o.at_door_at },
    { label: "Countdown ends", at: o.countdown_ends_at },
    { label: "Customer said they're at the door", at: o.customer_present_at },
    { label: "PIN entered", at: o.pin_entered_at },
    { label: "Marked not here", at: o.no_show_at },
    { label: "Delivered", at: o.delivered_at },
    { label: "Cancelled", at: o.cancelled_at },
    ...calls.map((cl) => ({ label: `${cl.caller_role === "runner" ? "Runner" : "Customer"} called through the app`, at: cl.created_at })),
  ]
    .filter((t): t is { label: string; at: Date } => !!t.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const pinLog = events.filter((e) => ["pin_ok", "pin_failed", "delivered", "no_show", "customer_present", "at_door"].includes(e.type));
  const receipt = photos.find((p) => p.kind === "confirmation");
  const evidence = photos.filter((p) => p.kind !== "confirmation");
  const thread = (party: "customer" | "runner") => messages.filter((m) => m.party === party);

  return (
    <div className="pb-10">
      <PageHeader back={{ href: "/admin/cases", label: "Cases" }} overline={`Order ${o.code} · ${o.spot_name} to ${o.building_short} ${o.floor}/${o.room}`} title={CASE_LABEL[c.type]} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Tag tone={c.priority === 1 ? "danger" : "warning"}>Priority {c.priority}</Tag>
        <Tag>{STATUS_LABEL[o.status]}</Tag>
        {c.auto_rejected && <Tag tone="danger">Auto-rejected: PIN was entered</Tag>}
        {c.refund_due_at && !c.refunded_at && c.status !== "resolved" && <span className="tnum text-small text-ink-2">Refund target {fmtDateTime(c.refund_due_at)}</span>}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-8">
          <section>
            <SectionTitle>Report</SectionTitle>
            <p className="mt-2 text-body">{c.description || c.reason || "Opened automatically."}</p>
            <p className="tnum mt-1 text-caption text-ink-3">{fmtDateTime(c.created_at)}</p>
            {c.runner_response ? (
              <div className="mt-4">
                <p className="text-caption font-semibold tracking-wide text-ink-3 uppercase">Runner&rsquo;s response</p>
                <p className="mt-1 text-body">{c.runner_response}</p>
                <p className="tnum mt-1 text-caption text-ink-3">{c.runner_responded_at && fmtDateTime(c.runner_responded_at)}</p>
              </div>
            ) : c.runner_id && c.response_due_at ? (
              <p className="tnum mt-3 text-small text-ink-3">Runner response due {fmtDateTime(c.response_due_at)}.</p>
            ) : null}
          </section>

          <section>
            <SectionTitle>Photo evidence</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
              {evidence.map((ph) => (
                <figure key={ph.id}>
                  <a href={ph.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt={PHOTO_LABEL[ph.kind] ?? ph.kind} className="aspect-square w-full rounded-xs border border-line object-cover" />
                  </a>
                  <figcaption className="mt-1 text-caption text-ink-3">
                    <span className="font-semibold text-ink-2">{PHOTO_LABEL[ph.kind] ?? ph.kind}</span>
                    <br />
                    <span className="tnum">{fmtDateTime(ph.created_at)}</span>
                    {ph.location_status && (
                      <>
                        <br />
                        <span className={cn("tnum", ph.location_status === "in_range" ? "text-success" : "text-danger")}>
                          {LOCATION_LABEL[ph.location_status]}
                          {ph.distance_m !== null ? ` · ${ph.distance_m} m` : ""}
                        </span>
                      </>
                    )}
                  </figcaption>
                </figure>
              ))}
              {evidence.length === 0 && <p className="text-small text-ink-3">No evidence photos on this order.</p>}
            </div>
          </section>

          <section>
            <SectionTitle>Timeline and call log</SectionTitle>
            <ol className="tnum mt-2 divide-y divide-line text-small">
              {timeline.map((t, i) => (
                <li key={i} className="flex justify-between gap-4 py-2">
                  <span>{t.label}</span>
                  <span className="text-ink-3">{fmtDateTime(t.at)}</span>
                </li>
              ))}
            </ol>
            {o.eta && <p className="tnum mt-2 text-small text-ink-2">ETA was {fmtTime(o.eta)}.</p>}
          </section>

          <section>
            <SectionTitle>PIN log</SectionTitle>
            {pinLog.length === 0 ? (
              <p className="mt-2 text-small text-ink-3">No PIN entries.</p>
            ) : (
              <ul className="tnum mt-2 divide-y divide-line text-small">
                {pinLog.map((e) => (
                  <li key={e.id} className="flex justify-between gap-4 py-2">
                    <span className={e.type === "pin_failed" ? "text-danger" : ""}>
                      {e.type === "pin_failed" ? `Wrong PIN (attempt ${String((e.data as { attempt?: number }).attempt ?? "")})` : e.type === "delivered" ? "Delivered" : EVENT_LABEL[e.type] ?? e.type}
                    </span>
                    <span className="text-ink-3">{fmtDateTime(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-8 md:grid-cols-2">
            {([
              ["customer", customer, custIncidents],
              ["runner", runner, runIncidents],
            ] as const).map(([role, p, inc]) => (
              <section key={role}>
                <SectionTitle>{role === "customer" ? "Customer" : "Runner"} history</SectionTitle>
                {!p ? (
                  <p className="mt-2 text-small text-ink-3">No runner on this order.</p>
                ) : (
                  <>
                    <p className="mt-2 font-semibold">{p.name}</p>
                    <p className="text-small text-ink-3">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                    <p className="tnum mt-1 text-small text-ink-2">
                      {role === "runner" ? `${p.deliveries} deliveries · ${p.strikes} active strikes` : `${p.orders} orders`}
                      {p.status === "banned" ? " · banned" : ""}
                    </p>
                    {p.flagged_at && <p className="mt-1 text-small font-semibold text-danger">Flagged: {p.flag_reason}</p>}
                    <ul className="tnum mt-2 divide-y divide-line text-small">
                      {inc.map((i, k) => (
                        <li key={k} className={cn("flex justify-between gap-2 py-1.5", i.voided && "text-ink-3 line-through")}>
                          <span>{i.type.replace(/_/g, " ")}{i.code ? ` · ${i.code}` : ""}{i.pending ? " (pending)" : ""}</span>
                          <span className="text-ink-3">{fmtDateTime(i.created_at)}</span>
                        </li>
                      ))}
                      {inc.length === 0 && <li className="py-1.5 text-ink-3">No incidents.</li>}
                    </ul>
                  </>
                )}
              </section>
            ))}
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <AdminThread caseId={c.id} party="customer" messages={thread("customer").map((m) => ({ fromAdmin: m.from_admin, body: m.body, at: m.created_at }))} />
            {c.runner_id && <AdminThread caseId={c.id} party="runner" messages={thread("runner").map((m) => ({ fromAdmin: m.from_admin, body: m.body, at: m.created_at }))} />}
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <section>
            <SectionTitle>Receipt and money</SectionTitle>
            {receipt && (
              <a href={receipt.url} target="_blank" rel="noreferrer" className="mt-3 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receipt.url} alt="Customer's receipt" className="max-h-64 w-full rounded-xs border border-line object-contain" />
              </a>
            )}
            <KeyValue
              className="mt-3"
              items={[
                { k: "Food total entered", v: <span className={o.food_total_flagged ? "text-danger" : ""}>{formatCents(o.food_value_cents)}{o.food_total_flagged ? " (flagged)" : ""}</span> },
                { k: "Delivery fee", v: formatCents(o.delivery_fee_cents) },
                { k: "Tip", v: formatCents(o.tip_cents) },
                { k: "Delivery guarantee", v: formatCents(o.guarantee_cents) },
                { k: "Paid with credit", v: formatCents(o.credit_applied_cents) },
                { k: "Charged to card", v: formatCents(o.charged_cents) },
                { k: "Already refunded", v: formatCents(o.refunded_cents) },
              ]}
            />
            <FlagTotal orderId={o.id} flagged={o.food_total_flagged} />
          </section>

          {c.status === "resolved" ? (
            <Notice tone={c.auto_rejected ? "danger" : "success"} title={c.auto_rejected ? "Auto-rejected" : OUTCOME_LABEL[c.outcome as CaseOutcome] ?? "Resolved"}>
              <span className="whitespace-pre-wrap">{c.outcome_note}</span>
              {c.refund_cash_cents + c.refund_credit_cents > 0 && (
                <span className="tnum mt-1 block">{formatCents(c.refund_cash_cents)} to card · {formatCents(c.refund_credit_cents)} credit</span>
              )}
            </Notice>
          ) : (
            <ResolveCase id={c.id} hasRunner={!!c.runner_id} />
          )}

          {c.appeal_at && (
            <section>
              <SectionTitle>Appeal</SectionTitle>
              <p className="mt-2 text-body whitespace-pre-wrap">{c.appeal_text}</p>
              <p className="tnum mt-1 text-caption text-ink-3">{fmtDateTime(c.appeal_at)}</p>
              {c.appeal_decision ? <p className="mt-2 font-semibold">Appeal {c.appeal_decision}. Final.</p> : <AppealDecision id={c.id} />}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
