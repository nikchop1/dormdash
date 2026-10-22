import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { getOrderView, orderEvents } from "@/lib/services/orders";
import { orderPhotos } from "@/lib/services/photos";
import { ACTION_LABEL, REASON_LABEL, type Dispute } from "@/lib/services/disputes";
import { STATUS_LABEL } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDateTime, fmtTime } from "@/lib/domain/time";
import { KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { ResolveForm } from "./resolve-form";

export const metadata: Metadata = { title: "Admin · Dispute" };

const PHOTO_LABEL: Record<string, string> = { confirmation: "Customer's order confirmation", pickup: "Runner at pickup", dropoff: "Runner at the door", dispute: "Customer's report photo" };

export default async function AdminDispute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await q1<Dispute>("select * from public.disputes where id = $1", [id]);
  if (!d) notFound();
  const db = { query: q };
  const [o, events, photos, history] = await Promise.all([
    getOrderView(db, d.order_id),
    orderEvents(db, d.order_id),
    orderPhotos(d.order_id),
    d.runner_id
      ? q1<{ deliveries: number; disputes: number; strikes: number }>(
          `select (select count(*)::int from public.orders where runner_id = $1 and status = 'delivered') as deliveries,
                  (select count(*)::int from public.disputes where runner_id = $1) as disputes,
                  (select count(*)::int from public.strikes where runner_id = $1 and not voided) as strikes`,
          [d.runner_id],
        )
      : null,
  ]);
  if (!o) notFound();
  const pinLog = events.filter((e) => ["pin_ok", "pin_failed", "delivered", "picked_up", "claimed", "late_refund"].includes(e.type));

  return (
    <div className="pb-10">
      <PageHeader back={{ href: "/admin/disputes", label: "Disputes" }} overline={`Order ${o.code} · ${o.spot_name}`} title={REASON_LABEL[d.reason]} />
      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-8">
          <section>
            <SectionTitle>Customer ({o.customer_name})</SectionTitle>
            <p className="mt-2 text-body">{d.description}</p>
            <p className="tnum mt-1 text-caption text-ink-3">{fmtDateTime(d.created_at)}</p>
          </section>
          <section>
            <SectionTitle>Runner ({o.runner_name ?? "none"})</SectionTitle>
            {d.runner_response ? (
              <>
                <p className="mt-2 text-body">{d.runner_response}</p>
                <p className="tnum mt-1 text-caption text-ink-3">{d.runner_responded_at && fmtDateTime(d.runner_responded_at)}</p>
              </>
            ) : (
              <p className="mt-2 text-small text-ink-3">No response yet.</p>
            )}
            {history && (
              <p className="tnum mt-2 text-small text-ink-2">Track record: {history.deliveries} deliveries · {history.disputes} reports · {history.strikes} active strikes</p>
            )}
          </section>
          <section>
            <SectionTitle>Photo evidence</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
              {photos.map((ph) => (
                <figure key={ph.id}>
                  <a href={ph.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt={PHOTO_LABEL[ph.kind]} className="aspect-square w-full rounded-xs border border-line object-cover" />
                  </a>
                  <figcaption className="mt-1 text-caption text-ink-3">{PHOTO_LABEL[ph.kind] ?? ph.kind}<br /><span className="tnum">{fmtTime(ph.created_at)}</span></figcaption>
                </figure>
              ))}
              {photos.length === 0 && <p className="text-small text-ink-3">No photos on this order.</p>}
            </div>
          </section>
          <section>
            <SectionTitle>Handoff and PIN log</SectionTitle>
            <ul className="tnum mt-2 divide-y divide-line text-small">
              {pinLog.map((e) => (
                <li key={e.id} className="flex justify-between gap-4 py-2">
                  <span className={e.type === "pin_failed" ? "text-danger" : ""}>
                    {e.type === "pin_ok" ? "PIN entered correctly" : e.type === "pin_failed" ? `Wrong PIN (attempt ${String((e.data as { attempt?: number }).attempt ?? "")})` : e.type === "late_refund" ? "Late: fee auto-refunded" : e.to_status ? STATUS_LABEL[e.to_status] : e.type}
                    {e.type === "delivered" && (e.data as { via?: string }).via === "photo" ? " (door photo)" : ""}
                  </span>
                  <span className="text-ink-3">{fmtDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
            {o.eta && <p className="tnum mt-2 text-small text-ink-2">ETA was {fmtTime(o.eta)}; delivered {o.delivered_at ? fmtTime(o.delivered_at) : "n/a"}.</p>}
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          <section>
            <SectionTitle>Money</SectionTitle>
            <KeyValue
              items={[
                { k: "Delivery fee", v: formatCents(o.delivery_fee_cents) },
                { k: "Tip", v: formatCents(o.tip_cents) },
                { k: "Already refunded", v: formatCents(o.refunded_cents) },
                { k: "Runner's fee share", v: formatCents(o.runner_fee_cents) },
              ]}
            />
          </section>
          {d.status === "resolved" ? (
            <Notice tone="success" title="Resolved">
              {d.resolution_actions.map((a) => ACTION_LABEL[a]).join(", ")}.{d.resolution_note ? ` ${d.resolution_note}` : ""}
            </Notice>
          ) : (
            <ResolveForm id={d.id} hasRunner={!!d.runner_id} feeAlreadyRefunded={!!o.late_refunded_at} hasTip={o.tip_cents > 0} />
          )}
        </aside>
      </div>
    </div>
  );
}
