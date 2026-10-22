import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DoorOpen, Flag, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { asUser, q } from "@/lib/db";
import { getOrderView, orderEvents } from "@/lib/services/orders";
import { orderPhotos } from "@/lib/services/photos";
import { CASE_LABEL, type CaseType } from "@/lib/services/cases";
import { getPricing } from "@/lib/settings";
import { avatarUrl } from "@/lib/storage";
import { cancellationTerms, STATUS_STEPS } from "@/lib/domain/orders";
import { missingDeliveryDue } from "@/lib/domain/handoff";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDateTime, nowMs } from "@/lib/domain/time";
import { OrderStatusHero } from "@/components/order-status";
import { KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { HandoffPanel, OrderActions, OrderLive, PinCard } from "./order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  // RLS-scoped reads: only rows the signed-in user is allowed to see.
  const data = await asUser(user.id, async (t) => {
    const o = await getOrderView(t, id);
    if (!o) return null;
    const [secret] = await t.query<{ pin: string }>("select pin from public.order_secrets where order_id = $1", [id]);
    const events = await orderEvents(t, id);
    const [rating] = await t.query<{ stars: number; comment: string }>("select stars, comment from public.ratings where order_id = $1", [id]);
    return { o, pin: secret?.pin ?? null, events, rating };
  });
  if (!data) notFound();
  const { o, pin, events, rating } = data;
  if (o.customer_id !== user.id) {
    if (o.runner_id === user.id) redirect("/run/active");
    if (user.isAdmin) redirect(`/admin/orders?q=${o.code}`);
    notFound();
  }

  const settings = await getPricing();
  const now = nowMs();
  const cases = await q<{ id: string; type: CaseType; status: string; auto_rejected: boolean }>(
    "select id, type, status, auto_rejected from public.cases where order_id = $1 order by created_at desc",
    [o.id],
  );
  const terms = cancellationTerms(
    { status: o.status, totalCents: o.charged_cents + o.credit_applied_cents, refundedCents: o.refunded_cents + o.floor_fee_refunded_cents, createdAt: o.created_at },
    "customer",
    new Date(now),
    settings,
  );
  const photos = await orderPhotos(o.id, ["door"]);
  const doorPhoto = photos.find((p) => p.id === o.door_photo_id) ?? null;
  const stepAt = (s: string) => {
    if (s === "requested") return events.find((e) => e.type === "paid")?.created_at ?? null;
    return [...events].reverse().find((e) => e.to_status === s)?.created_at ?? null;
  };
  const waitedMin = (now - o.created_at.getTime()) / 60000;
  const openCase = cases.find((c) => c.status !== "resolved") ?? null;
  const missingAt = o.picked_up_at ? new Date(o.picked_up_at.getTime() + settings.missingDeliveryMinutes * 60000) : null;
  const missingNow = missingDeliveryDue({ status: o.status, pickedUpAt: o.picked_up_at, atDoorAt: o.at_door_at, pinEnteredAt: o.pin_entered_at }, new Date(now), settings.missingDeliveryMinutes);
  const canReport = o.status === "delivered" && !openCase && o.delivered_at && now - o.delivered_at.getTime() < 72 * 3600000;
  const live = ["requested", "claimed", "picked_up", "on_the_way"].includes(o.status);
  const caseUnder = (t: CaseType) => cases.find((c) => c.type === t);
  const runnerName = o.runner_first || null;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <OrderLive id={o.id} active={live || (o.status === "delivered" && !!o.pin_entered_at && now - o.pin_entered_at.getTime() < settings.pinClaimWindowSeconds * 1000)} />
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
        runner={runnerName ? { firstName: runnerName, avatarUrl: avatarUrl(o.runner_avatar), rating: o.runner_rating, ratings: o.runner_ratings } : null}
        steps={STATUS_STEPS.map((s) => ({ status: s, at: stepAt(s)?.toISOString() ?? null }))}
      />

      <div className="mt-8 flex flex-col gap-8">
        {live && (
          <HandoffPanel
            orderId={o.id}
            status={o.status}
            handoff={o.handoff}
            runnerFirstName={runnerName}
            headsUp={!!o.heads_up_at}
            doorPhotoUrl={doorPhoto?.url ?? null}
            atDoorAt={o.at_door_at?.toISOString() ?? null}
            countdownEndsAt={o.countdown_ends_at?.toISOString() ?? null}
            presentUntil={o.countdown_ends_at ? new Date(o.countdown_ends_at.getTime() + settings.presentWindowAfterSeconds * 1000).toISOString() : null}
            customerPresent={!!o.customer_present_at}
            canCall={["claimed", "picked_up", "on_the_way"].includes(o.status)}
            missingAt={missingAt && !o.at_door_at ? missingAt.toISOString() : null}
            missingNow={missingNow}
            missingCaseId={caseUnder("missing_delivery")?.id ?? null}
          />
        )}

        {pin && live && o.status !== "requested" && <PinCard pin={pin} handoff={o.handoff} />}

        {o.status === "customer_no_show" && (
          <Notice tone="warning" icon={<TriangleAlert />} title="Your runner couldn't hand it off">
            They were at your {o.handoff === "lobby" ? "lobby" : "door"} with a photo, called you, and waited out the {Math.round(settings.doorCountdownSeconds / 60)}-minute countdown. Because
            there was no PIN, they were paid in full and there&rsquo;s no refund. They may have kept the food.
          </Notice>
        )}

        {o.status === "requested" && waitedMin >= settings.unclaimedCancelMinutes && (
          <Notice tone="warning" icon={<TriangleAlert />} title="Still nobody on it">
            It&rsquo;s been {Math.floor(waitedMin)} minutes. You can keep waiting, or cancel for a full refund.
          </Notice>
        )}
        {o.handoff === "lobby" && live && (
          <Notice tone="info" icon={<DoorOpen />} title="Meet in the lobby">
            Your runner doesn&rsquo;t live in {o.building_name}, so they can&rsquo;t come upstairs. Head down with your PIN when they say they&rsquo;re 2 minutes out.
            {o.floor_fee_refunded_cents > 0 ? ` We refunded the ${formatCents(o.floor_fee_refunded_cents)} floor fee.` : ""}
          </Notice>
        )}

        <OrderActions
          orderId={o.id}
          status={o.status}
          cancel={terms.allowed ? { refundCents: terms.refundCents, feeCents: terms.runnerFeeCents } : null}
          rated={rating ?? null}
          runnerFirstName={runnerName}
          pinClaimUntil={o.pin_entered_at && o.status === "delivered" ? new Date(o.pin_entered_at.getTime() + settings.pinClaimWindowSeconds * 1000).toISOString() : null}
          pinClaimCaseId={caseUnder("pin_no_food")?.id ?? null}
        />

        {cases.length > 0 && (
          <section>
            <SectionTitle>Cases</SectionTitle>
            <ul className="divide-y divide-line">
              {cases.map((c) => (
                <li key={c.id}>
                  <Link href={`/cases/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-sunken/60">
                    <span className="flex items-center gap-2 font-semibold"><Flag className="size-4" aria-hidden /> {CASE_LABEL[c.type]}</span>
                    <span className="text-small text-ink-2">{c.auto_rejected ? "Rejected" : c.status === "resolved" ? "Resolved" : c.status === "under_review" ? "Under review" : "Open"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {canReport && (
          <Link href={`/orders/${o.id}/report`} className="link inline-flex items-center gap-2 self-start text-small font-semibold">
            <Flag className="size-4" aria-hidden /> Report a problem with this order
          </Link>
        )}

        <section>
          <SectionTitle>Receipt</SectionTitle>
          <KeyValue
            items={[
              { k: "Pickup", v: <span className="text-small">{o.pickup_name}{o.order_number ? ` · #${o.order_number.replace(/^#/, "")}` : ""}</span> },
              { k: "Food total (your receipt)", v: formatCents(o.food_value_cents) },
              { k: "Delivery fee", v: formatCents(o.delivery_fee_cents) },
              ...(o.surge_fee_cents > 0 ? [{ k: `incl. busy pricing (${o.surge_multiplier}x)`, v: formatCents(o.surge_fee_cents) }] : []),
              ...(o.size_fee_cents > 0 ? [{ k: "incl. order size", v: formatCents(o.size_fee_cents) }] : []),
              ...(o.bag_fee_cents > 0 ? [{ k: `incl. extra bags (${o.bags - 1})`, v: formatCents(o.bag_fee_cents) }] : []),
              { k: "Tip", v: formatCents(o.tip_cents) },
              { k: "Delivery guarantee", v: formatCents(o.guarantee_cents) },
              ...(o.credit_applied_cents > 0 ? [{ k: "Paid with credit", v: <span className="text-success">{formatCents(-o.credit_applied_cents)}</span> }] : []),
              { k: "Charged to your card", v: formatCents(o.charged_cents), strong: true },
              ...(o.refunded_cents > 0 ? [{ k: "Refunded to your card", v: <span className="text-success">{formatCents(-o.refunded_cents)}</span> }] : []),
            ]}
          />
          <p className="mt-2 text-caption text-ink-3">
            Placed {fmtDateTime(o.created_at)} · {o.payment_provider === "demo" ? "Demo payment, nothing charged" : o.payment_provider === "credit" ? "Paid with Dormdash credit" : "Paid by card"}
          </p>
        </section>
      </div>
    </div>
  );
}
