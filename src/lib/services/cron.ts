import "server-only";
import { q, q1, tx } from "@/lib/db";
import { evaluateLateness, unclaimedActions } from "@/lib/domain/orders";
import { formatCents } from "@/lib/domain/pricing";
import { getCurrentSurge, getPricing } from "@/lib/settings";
import { notify, notifyOnShiftRunners } from "@/lib/notify";
import { cancelOrder, type OrderRow } from "./orders";
import { refundOrder } from "./money";
import { addStrike } from "./strikes";

/** 10 min unclaimed: re-ping runners. 20 min: tell the customer they can cancel for a full refund. */
export async function unclaimedSweep(now = new Date()) {
  const s = await getPricing();
  const orders = await q<OrderRow>("select * from public.orders where status = 'requested'");
  let pinged = 0;
  let prompted = 0;
  for (const o of orders) {
    const a = unclaimedActions(
      { status: o.status, createdAt: o.created_at, runnerPingedAt: o.runner_pinged_at, cancelPromptedAt: o.cancel_prompted_at, scheduledFor: o.scheduled_for },
      now,
      s,
    );
    if (a.ping) {
      await q("update public.orders set runner_pinged_at = now() where id = $1", [o.id]);
      await notifyOnShiftRunners({ title: `Still waiting · ${formatCents(o.runner_fee_cents + o.tip_cents)}`, body: `Floor ${o.floor} has been waiting ${s.unclaimedPingMinutes}+ min. Grab it?`, url: "/run" });
      pinged++;
    }
    if (a.promptCancel) {
      await q("update public.orders set cancel_prompted_at = now() where id = $1", [o.id]);
      await notify(o.customer_id, {
        category: "order_updates",
        title: "Still looking for a runner",
        body: `Nobody's grabbed order ${o.code} yet. You can keep waiting or cancel for a full refund.`,
        url: `/orders/${o.id}`,
      });
      prompted++;
    }
  }
  return { pinged, prompted };
}

/** Refund the delivery fee as soon as an in-flight order is past ETA + grace. */
export async function lateSweep(now = new Date()) {
  const s = await getPricing();
  const candidates = await q<{ id: string }>(
    `select id from public.orders where status in ('claimed','picked_up','on_the_way') and late_refunded_at is null
     and eta is not null and eta < now() - make_interval(mins => $1)`,
    [s.lateGraceMinutes],
  );
  let refunded = 0;
  for (const c of candidates) {
    const after: (() => Promise<unknown>)[] = [];
    await tx(async (t) => {
      const [o] = await t.query<OrderRow>("select * from public.orders where id = $1 for update", [c.id]);
      if (!o || o.late_refunded_at || !["claimed", "picked_up", "on_the_way"].includes(o.status)) return;
      const late = evaluateLateness({ eta: o.eta, deliveredAt: null, deliveryFeeCents: o.delivery_fee_cents, lateRefundedAt: o.late_refunded_at }, now, s);
      if (!late.late) return;
      const amount = await refundOrder(t, o, late.refundCents, `Late delivery refund, order ${o.code}`);
      await t.query("update public.orders set late_refunded_at = now() where id = $1", [o.id]);
      await t.query(
        "insert into public.order_events (order_id, type, data) values ($1, 'late_refund', $2::jsonb)",
        [o.id, JSON.stringify({ minutesLate: late.minutesLate, refund: amount })],
      );
      if (o.runner_id) {
        const st = await addStrike(t, { runnerId: o.runner_id, reason: "late", orderId: o.id, note: `${late.minutesLate} min past ETA`, threshold: s.strikeThreshold });
        after.push(st.after);
      }
      after.push(() =>
        notify(o.customer_id, {
          category: "order_updates",
          title: "Running late. Fee refunded",
          body: `Sorry. Order ${o.code} is past its ETA, so we refunded your ${formatCents(o.delivery_fee_cents)} delivery fee. It's still coming.`,
          url: `/orders/${o.id}`,
        }),
      );
      refunded++;
    });
    for (const f of after) await f().catch((e) => console.error(e));
  }
  return { refunded };
}

/** Abandoned checkouts: cancel orders stuck awaiting payment for 30+ minutes. */
export async function staleCheckoutSweep() {
  const stale = await q<{ id: string }>(
    "select id from public.orders where status = 'pending_payment' and created_at < now() - interval '30 minutes'",
  );
  for (const o of stale) await cancelOrder(null, "system", o.id, "Payment wasn't completed.").catch(() => {});
  return { cancelled: stale.length };
}

/** Record surge transitions and let on-shift runners know when busy pricing starts. */
export async function surgeSweep(now = new Date()) {
  const surge = await getCurrentSurge(now);
  const prev = await q1<{ value: { active: boolean; label: string | null } }>("select value from public.app_state where key = 'surge'");
  const active = !!surge;
  const changed = (prev?.value.active ?? false) !== active || (prev?.value.label ?? null) !== (surge?.label ?? null);
  if (changed) {
    await q(
      `insert into public.app_state (key, value, updated_at) values ('surge', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify({ active, label: surge?.label ?? null, multiplier: surge?.multiplier ?? 1, since: now.toISOString() })],
    );
    if (active) {
      await notifyOnShiftRunners({ title: `Busy pricing is on (${surge!.multiplier}x)`, body: `${surge!.label}. Delivery fees are up, so jobs pay more.`, url: "/run" });
    }
  }
  return { active, label: surge?.label ?? null, changed };
}
