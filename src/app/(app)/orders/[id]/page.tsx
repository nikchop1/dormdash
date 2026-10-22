import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DoorOpen, Flag, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { getOrderView, orderEvents } from "@/lib/services/orders";
import { orderPhotos } from "@/lib/services/photos";
import { REASON_LABEL, type Dispute } from "@/lib/services/disputes";
import { getPricing } from "@/lib/settings";
import { avatarUrl } from "@/lib/storage";
import { cancellationTerms, STATUS_STEPS } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDateTime, nowMs } from "@/lib/domain/time";
import { OrderStatusHero } from "@/components/order-status";
import { KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { OrderActions, PinCard, OrderLive } from "./order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  // RLS-scoped reads: this only returns rows the signed-in user is allowed to see.
  const data = await asUser(user.id, async (t) => {
    const o = await getOrderView(t, id);
    if (!o) return null;
    const [secret] = await t.query<{ pin: string }>("select pin from public.order_secrets where order_id = $1", [id]);
    const events = await orderEvents(t, id);
    const [rating] = await t.query<{ stars: number; comment: string }>("select stars, comment from public.ratings where order_id = $1", [id]);
    const disputes = await t.query<Dispute>("select * from public.disputes where order_id = $1 order by created_at desc", [id]);
    return { o, pin: secret?.pin ?? null, events, rating, dispute: disputes[0] ?? null };
  });
  if (!data) notFound();
  const { o, pin, events, rating, dispute } = data;
  if (o.customer_id !== user.id) {
    if (o.runner_id === user.id) redirect(`/run/jobs/${o.id}`);
    if (user.isAdmin) redirect(`/admin/orders?q=${o.code}`);
    notFound();
  }

  const settings = await getPricing();
  const terms = cancellationTerms(
    { status: o.status, totalCents: o.total_cents, refundedCents: o.refunded_cents, createdAt: o.created_at },
    "customer",
    new Date(),
    settings,
  );
  const photos = await orderPhotos(o.id, ["pickup", "dropoff"]);
  const stepAt = (s: string) => {
    if (s === "requested") return events.find((e) => e.type === "paid")?.created_at ?? null;
    return [...events].reverse().find((e) => e.to_status === s)?.created_at ?? null;
  };
  const now = nowMs();
  const waitedMin = (now - o.created_at.getTime()) / 60000;
  const canReport = o.status === "delivered" && !dispute && o.delivered_at && now - o.delivered_at.getTime() < 72 * 3600000;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <OrderLive id={o.id} active={!["delivered", "cancelled"].includes(o.status)} />
      <PageHeader back={{ href: "/orders", label: "Orders" }} title={<span className="sr-only">Order {o.code}</span>} className="pb-0" />

      <OrderStatusHero
        code={o.code}
        status={o.status}
        eta={o.eta?.toISOString() ?? null}
        scheduledFor={o.scheduled_for?.toISOString() ?? null}
        createdAt={o.created_at.toISOString()}
        spotName={o.spot_name}
        buildingShort={o.building_short}
        floor={o.floor}
        room={o.room}
        handoff={o.handoff}
        lateRefunded={!!o.late_refunded_at}
        runner={o.runner_name ? { firstName: o.runner_name.split(" ")[0], avatarUrl: avatarUrl(o.runner_avatar), rating: o.runner_rating, ratings: o.runner_ratings } : null}
        steps={STATUS_STEPS.map((s) => ({ status: s, at: stepAt(s)?.toISOString() ?? null }))}
      />

      <div className="mt-8 flex flex-col gap-8">
        {pin && !["delivered", "cancelled", "pending_payment"].includes(o.status) && <PinCard pin={pin} handoff={o.handoff} />}

        {o.status === "requested" && waitedMin >= settings.unclaimedCancelMinutes && (
          <Notice tone="warning" icon={<TriangleAlert />} title="Still nobody on it">
            It&rsquo;s been {Math.floor(waitedMin)} minutes. You can keep waiting, or cancel for a full {formatCents(o.total_cents - o.refunded_cents)} refund.
          </Notice>
        )}
        {o.handoff === "lobby" && ["claimed", "picked_up", "on_the_way"].includes(o.status) && (
          <Notice tone="info" icon={<DoorOpen />} title="Meet in the lobby">
            Your runner doesn&rsquo;t live in {o.building_name}, so they can&rsquo;t get upstairs. Head down when they say they&rsquo;re close.
          </Notice>
        )}

        <OrderActions
          orderId={o.id}
          status={o.status}
          cancel={terms.allowed ? { refundCents: terms.refundCents, feeCents: terms.runnerFeeCents } : null}
          rated={rating ?? null}
          runnerFirstName={o.runner_name?.split(" ")[0] ?? null}
        />

        {dispute && (
          <Notice tone={dispute.status === "resolved" ? "success" : "warning"} icon={<Flag />} title={dispute.status === "resolved" ? "Problem report resolved" : "Problem reported"}>
            {REASON_LABEL[dispute.reason]}.{" "}
            {dispute.status === "resolved"
              ? dispute.resolution_note || "We emailed you the outcome."
              : "An admin is looking at it. You'll get an email and a notification with the outcome."}
          </Notice>
        )}
        {canReport && (
          <Link href={`/orders/${o.id}/report`} className="link inline-flex items-center gap-2 self-start text-small font-semibold">
            <Flag className="size-4" aria-hidden /> Report a problem
          </Link>
        )}

        {photos.length > 0 && (
          <section>
            <SectionTitle>Proof</SectionTitle>
            <div className="mt-2 flex gap-3">
              {photos.map((ph) => (
                <figure key={ph.id} className="w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt={ph.kind === "pickup" ? "Bag at pickup" : "Left at the door"} className="aspect-square w-28 rounded-xs object-cover" />
                  <figcaption className="mt-1 text-caption text-ink-3">{ph.kind === "pickup" ? "At pickup" : "At your door"}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Receipt</SectionTitle>
          <KeyValue
            items={[
              { k: "Pickup", v: <span className="text-small">{o.pickup_name}{o.order_number ? ` · #${o.order_number.replace(/^#/, "")}` : ""}</span> },
              { k: "Delivery fee", v: formatCents(o.delivery_fee_cents) },
              ...(o.surge_fee_cents > 0 ? [{ k: `incl. busy pricing (${o.surge_multiplier}x)`, v: formatCents(o.surge_fee_cents) }] : []),
              { k: "Tip", v: formatCents(o.tip_cents) },
              { k: "Charged", v: formatCents(o.total_cents), strong: true },
              ...(o.refunded_cents > 0 ? [{ k: "Refunded", v: <span className="text-success">{formatCents(-o.refunded_cents)}</span> }] : []),
            ]}
          />
          <p className="mt-2 text-caption text-ink-3">
            Placed {fmtDateTime(o.created_at)} · {o.payment_provider === "demo" ? "Demo payment, nothing charged" : "Paid with PayPal"}
          </p>
        </section>
      </div>
    </div>
  );
}
