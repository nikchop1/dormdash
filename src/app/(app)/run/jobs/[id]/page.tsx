import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { getOrderView } from "@/lib/services/orders";
import { orderPhotos } from "@/lib/services/photos";
import { getPricing } from "@/lib/settings";
import { STATUS_LABEL } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { fmtTime } from "@/lib/domain/time";
import { formatPhone } from "@/lib/validation";
import { Countdown } from "@/components/countdown";
import { FloorBadge, KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { JobActions } from "./job-actions";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const o = await asUser(user.id, (t) => getOrderView(t, id));
  if (!o || o.runner_id !== user.id) notFound();
  const [photos, settings, unclaims] = await Promise.all([
    orderPhotos(o.id, ["confirmation", "pickup", "dropoff"]),
    getPricing(),
    asUser(user.id, (t) => t.query<{ n: number }>("select count(*)::int as n from public.unclaims where runner_id = $1 and created_at > now() - interval '7 days'", [user.id])),
  ]);
  const confirmation = photos.find((p) => p.kind === "confirmation");
  const customerFirst = o.customer_name.split(" ")[0];
  const unclaimWillStrike = unclaims[0].n + 1 > settings.freeUnclaimsPerWeek;
  const live = ["claimed", "picked_up", "on_the_way"].includes(o.status);

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/run", label: "Run" }} overline={`Job ${o.code} · ${STATUS_LABEL[o.status]}`} title={o.spot_name}>
        {live && o.eta && (
          <span className="tnum">
            Due <span className="font-semibold text-ink">{fmtTime(o.eta)}</span> · <Countdown to={o.eta.toISOString()} />
          </span>
        )}
      </PageHeader>

      {o.status === "cancelled" && (
        <Notice tone="warning" title="Customer cancelled">
          Don&rsquo;t pick it up. {o.cancelled_by === "customer" && o.claimed_at ? `You get the ${formatCents(settings.cancelFeeCents)} cancellation fee.` : ""}
        </Notice>
      )}

      <section aria-labelledby="pickup-h">
        <SectionTitle><span id="pickup-h">1. Pick up</span></SectionTitle>
        <KeyValue
          items={[
            { k: "Where", v: <span className="text-small">{o.spot_address}</span> },
            { k: "Name on order", v: <span className="font-semibold">{o.pickup_name}</span> },
            ...(o.order_number ? [{ k: "Order number", v: <span className="font-semibold">#{o.order_number.replace(/^#/, "")}</span> }] : []),
          ]}
        />
        {o.spot_notes && <p className="mt-2 text-small text-ink-2">{o.spot_notes}</p>}
        {confirmation && (
          <details className="mt-3 group">
            <summary className="link cursor-pointer text-small font-semibold">Customer&rsquo;s confirmation screenshot</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={confirmation.url} alt="Order confirmation screenshot" className="mt-2 max-h-96 rounded-sm border border-line" />
          </details>
        )}
      </section>

      <section aria-labelledby="drop-h" className="mt-8">
        <SectionTitle><span id="drop-h">2. Drop off</span></SectionTitle>
        <div className="flex items-center gap-4 py-3">
          <FloorBadge floor={o.floor} size="lg" />
          <div className="flex-1">
            <p className="font-semibold">{o.building_name}, room {o.room}</p>
            <p className="text-small text-ink-2">
              {o.handoff === "lobby" ? `Lobby handoff. You're not a resident, so meet ${customerFirst} downstairs.` : `Door delivery to ${customerFirst}.`}
            </p>
          </div>
        </div>
        {o.notes && <p className="rounded-sm bg-sunken px-3 py-2 text-small">&ldquo;{o.notes}&rdquo;</p>}
        {live && o.customer_phone && (
          <a href={`sms:${o.customer_phone}`} className="link mt-3 inline-flex items-center gap-2 text-small font-semibold">
            <MessageSquare className="size-4" aria-hidden /> Text {customerFirst} at {formatPhone(o.customer_phone)}
          </a>
        )}
      </section>

      <div className="mt-8">
        <JobActions
          orderId={o.id}
          status={o.status}
          handoff={o.handoff}
          customerFirst={customerFirst}
          pinAttempts={o.pin_attempts}
          unclaimWillStrike={unclaimWillStrike}
        />
      </div>

      <section className="mt-10">
        <SectionTitle>Your pay</SectionTitle>
        <KeyValue
          items={[
            { k: "Delivery fee share", v: o.late_refunded_at ? <span className="text-danger">{formatCents(0)} (late)</span> : formatCents(o.runner_fee_cents) },
            { k: "Tip", v: formatCents(o.tip_cents) },
            { k: "Total", v: formatCents((o.late_refunded_at ? 0 : o.runner_fee_cents) + o.tip_cents), strong: true },
          ]}
        />
        <p className="mt-2 text-caption text-ink-3">Late by more than {settings.lateGraceMinutes} minutes past ETA and the customer gets the fee back. You keep the tip.</p>
      </section>
    </div>
  );
}
