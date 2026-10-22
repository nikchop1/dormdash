import "server-only";
import { q, q1, tx, type Queryable } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { paymentsMode } from "@/lib/env";
import { haversineMiles } from "@/lib/domain/geo";
import {
  cancellationTerms,
  evaluateLateness,
  generateOrderCode,
  generatePin,
  handoffFor,
  MAX_PIN_ATTEMPTS,
  RUNNER_ACTIVE_STATUSES,
  transition,
  TransitionError,
  type Actor,
  type OrderAction,
  type OrderStatus,
} from "@/lib/domain/orders";
import { activeSurge, estimateMinutes, formatCents, isQuoteError, quoteDelivery, type Quote } from "@/lib/domain/pricing";
import { unclaimEarnsStrike } from "@/lib/domain/runners";
import { fmtTime } from "@/lib/domain/time";
import { getPayments } from "@/lib/payments";
import { getPricing, getSurgeWindows, flag } from "@/lib/settings";
import { notify, notifyOnShiftRunners } from "@/lib/notify";
import { coverageStatus } from "./coverage";
import { addEarning, recordPlatformFee, refundOrder } from "./money";
import { takePhoto } from "./photos";
import { addStrike } from "./strikes";
import type { SessionUser } from "@/lib/auth/session";

export type OrderRow = {
  id: string;
  code: string;
  customer_id: string;
  runner_id: string | null;
  batch_id: string | null;
  spot_id: string;
  building_id: string;
  floor: number;
  room: string;
  pickup_name: string;
  order_number: string;
  notes: string;
  status: OrderStatus;
  handoff: "door" | "lobby" | null;
  scheduled_for: Date | null;
  distance_miles: number;
  base_fee_cents: number;
  distance_fee_cents: number;
  floor_fee_cents: number;
  surge_multiplier: number;
  surge_fee_cents: number;
  delivery_fee_cents: number;
  tip_cents: number;
  total_cents: number;
  platform_fee_cents: number;
  runner_fee_cents: number;
  payment_provider: string;
  payment_ref: string | null;
  capture_ref: string | null;
  payment_status: string;
  refunded_cents: number;
  eta: Date | null;
  claimed_at: Date | null;
  picked_up_at: Date | null;
  on_the_way_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  delivered_via: string | null;
  pin_attempts: number;
  late_refunded_at: Date | null;
  runner_pinged_at: Date | null;
  cancel_prompted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type After = () => Promise<unknown>;

async function runAfter(fns: After[]) {
  for (const f of fns) {
    try {
      await f();
    } catch (e) {
      console.error("[after-commit]", e);
    }
  }
}

async function lockOrder(t: Queryable, orderId: string): Promise<OrderRow> {
  const [o] = await t.query<OrderRow>("select * from public.orders where id = $1 for update", [orderId]);
  if (!o) throw new ApiError(404, "not_found", "We couldn't find that order.");
  return o;
}

function step(o: OrderRow, action: OrderAction, actor: Actor): OrderStatus {
  try {
    return transition(o.status, action, actor);
  } catch (e) {
    if (e instanceof TransitionError) throw new ApiError(409, "bad_transition", e.message);
    throw e;
  }
}

async function logEvent(t: Queryable, orderId: string, actorId: string | null, type: string, from: OrderStatus | null, to: OrderStatus | null, data: object = {}) {
  await t.query(
    "insert into public.order_events (order_id, actor_id, type, from_status, to_status, data) values ($1, $2, $3, $4, $5, $6::jsonb)",
    [orderId, actorId, type, from, to, JSON.stringify(data)],
  );
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function quoteFor(input: { spotId: string; buildingId: string; floor: number; tipCents: number; at?: Date }) {
  const [settings, windows, diningOn] = await Promise.all([getPricing(), getSurgeWindows(), flag("dining_halls_enabled")]);
  const row = await q1<{ distance_miles: number; enabled: boolean; active: boolean; type: string; floor_count: number; b_active: boolean }>(
    `select d.distance_miles, d.enabled, sp.active, sp.type, b.floor_count, b.active as b_active
     from public.spot_building_distances d
     join public.pickup_spots sp on sp.id = d.spot_id
     join public.buildings b on b.id = d.building_id
     where d.spot_id = $1 and d.building_id = $2`,
    [input.spotId, input.buildingId],
  );
  if (!row || !row.active || !row.b_active || !row.enabled || (row.type === "dining_hall" && !diningOn)) {
    throw new ApiError(400, "spot_unavailable", "That spot isn't delivering to your building right now. Pick another one.");
  }
  if (input.floor > row.floor_count) {
    throw new ApiError(400, "bad_floor", `Your building only goes up to floor ${row.floor_count}. Double-check your floor.`);
  }
  const surge = activeSurge(input.at ?? new Date(), windows, settings);
  const quote = quoteDelivery({ distanceMiles: Number(row.distance_miles), floor: input.floor, tipCents: input.tipCents, surge, settings });
  if (isQuoteError(quote)) {
    throw new ApiError(400, "out_of_range", `That spot is outside our ${quote.maxRadiusMiles} mile delivery radius.`);
  }
  return { quote, settings };
}

// ---------------------------------------------------------------------------
// Create + pay
// ---------------------------------------------------------------------------

export type CreateOrderInput = {
  spotId: string;
  pickupName: string;
  orderNumber: string;
  buildingId: string;
  floor: number;
  room: string;
  notes: string;
  tipCents: number;
  scheduledFor: string | null;
  confirmationPhotoId: string;
};

export async function createOrder(user: SessionUser, input: CreateOrderInput) {
  const active = await q1<{ n: number }>(
    "select count(*)::int as n from public.orders where customer_id = $1 and status in ('requested','claimed','picked_up','on_the_way')",
    [user.id],
  );
  if ((active?.n ?? 0) >= 3) throw new ApiError(409, "too_many_active", "You already have 3 orders in flight. Let one land first.");

  let scheduledFor: Date | null = null;
  const now = new Date();
  if (input.scheduledFor) {
    if (!(await flag("scheduled_orders_enabled"))) throw new ApiError(400, "no_scheduling", "Scheduling is off right now. Order ASAP instead.");
    scheduledFor = new Date(input.scheduledFor);
    const mins = (scheduledFor.getTime() - now.getTime()) / 60000;
    if (mins < 20) throw new ApiError(400, "too_soon", "Scheduled orders need at least 20 minutes of lead time. Pick ASAP instead.");
    if (mins > 3 * 24 * 60) throw new ApiError(400, "too_far", "You can schedule up to 3 days ahead.");
  } else {
    const cov = await coverageStatus(now);
    if (cov.onShift === 0) {
      throw new ApiError(
        409,
        "no_runners",
        cov.next ? `Nobody's running right now. Next crew: ${cov.next.label}. Schedule for then?` : "Nobody's running right now. Check back later.",
      );
    }
  }

  const { quote } = await quoteFor({ ...input, at: scheduledFor ?? now });
  const provider = getPayments();

  const order = await tx(async (t) => {
    await takePhoto(t, input.confirmationPhotoId, user.id, "confirmation");
    let code = generateOrderCode();
    for (let i = 0; i < 5; i++) {
      const [dupe] = await t.query("select 1 from public.orders where code = $1", [code]);
      if (!dupe) break;
      code = generateOrderCode();
    }
    const [o] = await t.query<OrderRow>(
      `insert into public.orders (
        code, customer_id, spot_id, building_id, floor, room, pickup_name, order_number, notes, scheduled_for,
        distance_miles, base_fee_cents, distance_fee_cents, floor_fee_cents, surge_multiplier, surge_fee_cents,
        delivery_fee_cents, tip_cents, total_cents, platform_fee_cents, runner_fee_cents, payment_provider)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning *`,
      [
        code, user.id, input.spotId, input.buildingId, input.floor, input.room, input.pickupName, input.orderNumber, input.notes,
        scheduledFor ? scheduledFor.toISOString() : null,
        quote.distanceMiles, quote.baseFeeCents, quote.distanceFeeCents, quote.floorFeeCents, quote.surgeMultiplier, quote.surgeFeeCents,
        quote.deliveryFeeCents, quote.tipCents, quote.totalCents, quote.platformFeeCents, quote.runnerFeeCents, provider.mode,
      ],
    );
    await t.query("insert into public.order_secrets (order_id, pin) values ($1, $2)", [o.id, generatePin()]);
    await t.query("update public.photos set order_id = $1 where id = $2", [o.id, input.confirmationPhotoId]);
    await logEvent(t, o.id, user.id, "created", null, "pending_payment", { total: quote.totalCents });
    return o;
  });

  const { ref } = await provider.createCheckout({
    orderId: order.id,
    code: order.code,
    deliveryFeeCents: order.delivery_fee_cents,
    tipCents: order.tip_cents,
    totalCents: order.total_cents,
  });
  await q("update public.orders set payment_ref = $2 where id = $1", [order.id, ref]);

  if (provider.mode === "demo") {
    // No buyer approval step in demo mode: capture right away.
    await capturePayment(order.id, user.id);
  }
  return { orderId: order.id, code: order.code, paymentRef: ref, mode: provider.mode, quote };
}

/** Capture an approved payment and put the order on the board. Idempotent. */
export async function capturePayment(orderId: string, customerId: string | null) {
  const o = await q1<OrderRow>("select * from public.orders where id = $1", [orderId]);
  if (!o) throw new ApiError(404, "not_found", "We couldn't find that order.");
  if (customerId && o.customer_id !== customerId) throw new ApiError(404, "not_found", "We couldn't find that order.");
  if (o.status !== "pending_payment") return { status: o.status };
  if (!o.payment_ref) throw new ApiError(409, "no_checkout", "This order has no payment attached. Start a new one.");

  const res = await getPayments().capture(o.payment_ref);
  if (res.status !== "succeeded") {
    await q("update public.orders set payment_status = 'failed' where id = $1", [orderId]);
    throw new ApiError(402, "payment_failed", `Payment didn't go through${res.message ? `: ${res.message}` : "."} Try another payment method.`);
  }
  return markPaid(orderId, res.captureRef!);
}

/** Shared by capturePayment and the PayPal webhook. */
export async function markPaid(orderId: string, captureRef: string) {
  const after: After[] = [];
  const result = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.status !== "pending_payment") return { status: o.status };
    const to = step(o, "payment_succeeded", "system");
    await t.query(
      "update public.orders set status = $2, payment_status = 'succeeded', capture_ref = $3 where id = $1",
      [o.id, to, captureRef],
    );
    await t.query(
      "insert into public.ledger (order_id, user_id, kind, amount_cents, provider, provider_ref, memo) values ($1, $2, 'charge', $3, $4, $5, $6)",
      [o.id, o.customer_id, o.total_cents, o.payment_provider, captureRef, `Delivery fee + tip, order ${o.code}`],
    );
    await logEvent(t, o.id, null, "paid", o.status, to, { capture: captureRef });
    const scheduled = o.scheduled_for && o.scheduled_for.getTime() - Date.now() > 45 * 60000;
    if (!scheduled) {
      after.push(() =>
        notifyOnShiftRunners({
          title: `New job · ${formatCents(o.runner_fee_cents + o.tip_cents)}`,
          body: `Pickup going to floor ${o.floor}. Open the board to claim it.`,
          url: "/run",
        }),
      );
    }
    return { status: to };
  });
  await runAfter(after);
  return result;
}

// ---------------------------------------------------------------------------
// Runner actions
// ---------------------------------------------------------------------------

async function assertCanRun(t: Queryable, runnerId: string) {
  const [p] = await t.query<{ runner_status: string; on_shift: boolean; status: string; payout_email: string | null }>(
    "select runner_status, on_shift, status, payout_email from public.profiles where id = $1 for update",
    [runnerId],
  );
  if (!p || p.status !== "active" || p.runner_status !== "approved") throw new ApiError(403, "not_runner", "Only approved runners can claim jobs.");
  if (!p.on_shift) throw new ApiError(409, "off_shift", "Go on shift to claim jobs.");
  if (paymentsMode === "paypal" && !p.payout_email) {
    throw new ApiError(409, "no_payout", "Add your PayPal email for payouts before claiming jobs.");
  }
}

/** Claim one order, or several as a batch. All-or-nothing. */
export async function claimOrders(runnerId: string, orderIds: string[]) {
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) throw new ApiError(400, "empty", "Pick at least one job.");
  const settings = await getPricing();
  const after: After[] = [];
  const claimed = await tx(async (t) => {
    await assertCanRun(t, runnerId);
    const [{ n }] = await t.query<{ n: number }>(
      "select count(*)::int as n from public.orders where runner_id = $1 and status in ('claimed','picked_up','on_the_way')",
      [runnerId],
    );
    if (n + ids.length > settings.maxActiveOrders) {
      throw new ApiError(409, "too_many", `You can carry ${settings.maxActiveOrders} at once. You have ${n} active, so that's too many.`);
    }
    const [runner] = await t.query<{ runner_home_building_id: string | null; full_name: string }>(
      "select runner_home_building_id, full_name from public.profiles where id = $1",
      [runnerId],
    );
    let batchId: string | null = null;
    if (ids.length > 1) {
      const [b] = await t.query<{ id: string }>("insert into public.batches (runner_id) values ($1) returning id", [runnerId]);
      batchId = b.id;
    }
    const out: OrderRow[] = [];
    for (const id of ids) {
      const o = await lockOrder(t, id);
      if (o.customer_id === runnerId) throw new ApiError(409, "own_order", "You can't run your own order.");
      if (o.status !== "requested") throw new ApiError(409, "taken", `Order ${o.code} was just grabbed by someone else.`);
      const to = step(o, "claim", "runner");
      const [b] = await t.query<{ id: string; door_requires_resident: boolean }>(
        "select id, door_requires_resident from public.buildings where id = $1",
        [o.building_id],
      );
      const handoff = handoffFor({ id: b.id, doorRequiresResident: b.door_requires_resident }, runner.runner_home_building_id);
      const mins = estimateMinutes(Number(o.distance_miles), o.floor, ids.length);
      const etaBase = Date.now() + mins * 60000;
      const eta = new Date(o.scheduled_for ? Math.max(etaBase, o.scheduled_for.getTime()) : etaBase);
      const [u] = await t.query<OrderRow>(
        `update public.orders set status = $2, runner_id = $3, batch_id = $4, handoff = $5, eta = $6, claimed_at = now()
         where id = $1 returning *`,
        [o.id, to, runnerId, batchId, handoff, eta.toISOString()],
      );
      await logEvent(t, o.id, runnerId, "claimed", o.status, to, { eta: eta.toISOString(), handoff, batch: batchId });
      out.push(u);
      const first = runner.full_name.split(" ")[0];
      after.push(() =>
        notify(o.customer_id, {
          category: "order_updates",
          title: `${first} has your order`,
          body: handoff === "lobby"
            ? `ETA ${fmtTime(eta)}. ${first} doesn't live in your building, so you'll meet in the lobby.`
            : `ETA ${fmtTime(eta)}. Keep your PIN handy for the handoff.`,
          url: `/orders/${o.id}`,
        }),
      );
    }
    return out;
  });
  await runAfter(after);
  return claimed;
}

export async function unclaimOrder(runnerId: string, orderId: string) {
  const settings = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const to = step(o, "unclaim", "runner");
    await t.query(
      `update public.orders set status = $2, runner_id = null, batch_id = null, handoff = null, eta = null, claimed_at = null
       where id = $1`,
      [o.id, to],
    );
    await t.query("insert into public.unclaims (runner_id, order_id) values ($1, $2)", [runnerId, o.id]);
    await logEvent(t, o.id, runnerId, "unclaimed", o.status, to);
    const [{ n }] = await t.query<{ n: number }>(
      "select count(*)::int as n from public.unclaims where runner_id = $1 and created_at > now() - interval '7 days'",
      [runnerId],
    );
    let strike = false;
    if (unclaimEarnsStrike(n, settings.freeUnclaimsPerWeek)) {
      const s = await addStrike(t, { runnerId, reason: "unclaim", orderId: o.id, note: `Unclaim #${n} this week`, threshold: settings.strikeThreshold });
      after.push(s.after);
      strike = true;
    }
    after.push(() =>
      notify(o.customer_id, {
        category: "order_updates",
        title: "Your runner had to drop this one",
        body: "It's back on the board and the next runner can grab it. Nothing you need to do.",
        url: `/orders/${o.id}`,
      }),
    );
    after.push(() => notifyOnShiftRunners({ title: "Job back on the board", body: `Going to floor ${o.floor}.`, url: "/run" }, runnerId));
    return { strike, unclaimsThisWeek: n };
  });
  await runAfter(after);
  return res;
}

export async function pickupOrder(runnerId: string, orderId: string, photoId: string) {
  const after: After[] = [];
  await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const to = step(o, "pickup", "runner");
    await takePhoto(t, photoId, runnerId, "pickup");
    await t.query("update public.photos set order_id = $1 where id = $2", [o.id, photoId]);
    await t.query("update public.orders set status = $2, picked_up_at = now() where id = $1", [o.id, to]);
    await logEvent(t, o.id, runnerId, "picked_up", o.status, to, { photo: photoId });
    after.push(() =>
      notify(o.customer_id, { category: "order_updates", title: "Food's picked up", body: "Your runner has the bag and is heading your way.", url: `/orders/${o.id}` }),
    );
  });
  await runAfter(after);
}

export async function departOrder(runnerId: string, orderId: string) {
  const after: After[] = [];
  await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const to = step(o, "depart", "runner");
    await t.query("update public.orders set status = $2, on_the_way_at = now() where id = $1", [o.id, to]);
    await logEvent(t, o.id, runnerId, "on_the_way", o.status, to);
    after.push(() =>
      notify(o.customer_id, {
        category: "order_updates",
        title: o.handoff === "lobby" ? "Almost there. Head to the lobby" : "On the way up",
        body: o.handoff === "lobby" ? "Meet your runner in the lobby with your PIN." : `Heading to floor ${o.floor}. Have your PIN ready.`,
        url: `/orders/${o.id}`,
      }),
    );
  });
  await runAfter(after);
}

export async function deliverOrder(runnerId: string, orderId: string, proof: { pin: string } | { photoId: string }) {
  const settings = await getPricing();
  const after: After[] = [];
  const result = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const to = step(o, "deliver", "runner");
    let via: "pin" | "photo";
    if ("pin" in proof) {
      if (o.pin_attempts >= MAX_PIN_ATTEMPTS) {
        throw new ApiError(423, "pin_locked", "Too many wrong PINs. Leave it at the door and upload a photo instead.");
      }
      const [s] = await t.query<{ pin: string }>("select pin from public.order_secrets where order_id = $1", [o.id]);
      if (!s || s.pin !== proof.pin) {
        await t.query("update public.orders set pin_attempts = pin_attempts + 1 where id = $1", [o.id]);
        await logEvent(t, o.id, runnerId, "pin_failed", null, null, { attempt: o.pin_attempts + 1 });
        return { wrongPin: true as const, attemptsLeft: MAX_PIN_ATTEMPTS - o.pin_attempts - 1 };
      }
      via = "pin";
      await logEvent(t, o.id, runnerId, "pin_ok", null, null);
    } else {
      await takePhoto(t, proof.photoId, runnerId, "dropoff");
      await t.query("update public.photos set order_id = $1 where id = $2", [o.id, proof.photoId]);
      via = "photo";
    }
    await t.query("update public.orders set status = $2, delivered_at = now(), delivered_via = $3 where id = $1", [o.id, to, via]);
    o.delivered_at = new Date();
    await logEvent(t, o.id, runnerId, "delivered", o.status, to, { via });

    // Settle: late refund (fee only), runner earnings, platform revenue.
    const late = evaluateLateness(
      { eta: o.eta, deliveredAt: o.delivered_at, deliveryFeeCents: o.delivery_fee_cents, lateRefundedAt: o.late_refunded_at },
      new Date(),
      settings,
    );
    const feeRefunded = !!o.late_refunded_at || late.refundCents > 0;
    if (late.refundCents > 0) {
      await refundOrder(t, o, late.refundCents, `Late delivery refund, order ${o.code}`);
      await t.query("update public.orders set late_refunded_at = now() where id = $1", [o.id]);
      await logEvent(t, o.id, null, "late_refund", null, null, { minutesLate: late.minutesLate, refund: late.refundCents });
      const s = await addStrike(t, { runnerId, reason: "late", orderId: o.id, note: `${late.minutesLate} min past ETA`, threshold: settings.strikeThreshold });
      after.push(s.after);
    }
    if (!feeRefunded) {
      await addEarning(t, { runnerId, orderId: o.id, kind: "delivery_fee", amountCents: o.runner_fee_cents, holdHours: settings.payoutHoldHours });
      await recordPlatformFee(t, o, o.platform_fee_cents, `Platform fee, order ${o.code}`);
    }
    await addEarning(t, { runnerId, orderId: o.id, kind: "tip", amountCents: o.tip_cents, holdHours: settings.payoutHoldHours });

    after.push(() =>
      notify(o.customer_id, {
        category: "order_updates",
        title: via === "photo" ? "Delivered. It's at your door" : "Delivered. Enjoy",
        body: late.refundCents > 0
          ? "It ran late, so we refunded your delivery fee. Rate your runner when you get a sec."
          : "Rate your runner when you get a sec. It helps the good ones get more jobs.",
        url: `/orders/${o.id}`,
      }),
    );
    return { delivered: true as const, late: late.late, refunded: late.refundCents };
  });
  await runAfter(after);
  return result;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export async function cancelOrder(actorId: string | null, actor: Actor, orderId: string, reason: string) {
  const settings = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (actor === "customer" && o.customer_id !== actorId) throw new ApiError(404, "not_found", "We couldn't find that order.");
    const terms = cancellationTerms(
      { status: o.status, totalCents: o.total_cents, refundedCents: o.refunded_cents, createdAt: o.created_at },
      actor,
      new Date(),
      settings,
    );
    if (!terms.allowed) throw new ApiError(409, "cannot_cancel", terms.reason);
    const to = step(o, "cancel", actor);
    const refunded = await refundOrder(t, o, terms.refundCents, `Cancelled, order ${o.code}`);
    await t.query(
      "update public.orders set status = $2, cancelled_at = now(), cancelled_by = $3, cancel_reason = $4 where id = $1",
      [o.id, to, actor, reason.slice(0, 200)],
    );
    if (terms.runnerFeeCents > 0 && o.runner_id) {
      await addEarning(t, { runnerId: o.runner_id, orderId: o.id, kind: "cancellation_fee", amountCents: terms.runnerFeeCents, holdHours: settings.payoutHoldHours, memo: "Customer cancelled after claim" });
    }
    await logEvent(t, o.id, actorId, "cancelled", o.status, to, { by: actor, kind: terms.kind, refund: refunded, runnerFee: terms.runnerFeeCents });
    if (o.runner_id && o.status !== "requested") {
      const runnerId = o.runner_id;
      after.push(() =>
        notify(runnerId, {
          category: "order_updates",
          title: `Order ${o.code} was cancelled`,
          body: terms.runnerFeeCents > 0 ? `Don't pick it up. You still get a $${(terms.runnerFeeCents / 100).toFixed(2)} cancellation fee.` : "Don't pick it up.",
          url: "/run",
        }),
      );
    }
    if (actor !== "customer") {
      after.push(() =>
        notify(o.customer_id, {
          category: "order_updates",
          title: `Order ${o.code} was cancelled`,
          body: refunded > 0 ? `We refunded $${(refunded / 100).toFixed(2)}. ${reason}` : reason,
          url: `/orders/${o.id}`,
        }),
      );
    }
    return { refundedCents: refunded, runnerFeeCents: terms.runnerFeeCents, kind: terms.kind };
  });
  await runAfter(after);
  return res;
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

export async function rateOrder(customerId: string, orderId: string, stars: number, comment: string) {
  await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.customer_id !== customerId) throw new ApiError(404, "not_found", "We couldn't find that order.");
    if (o.status !== "delivered" || !o.runner_id) throw new ApiError(409, "not_delivered", "You can rate once it's delivered.");
    const [existing] = await t.query("select 1 from public.ratings where order_id = $1", [o.id]);
    if (existing) throw new ApiError(409, "already_rated", "You already rated this one. Thanks!");
    await t.query(
      "insert into public.ratings (order_id, customer_id, runner_id, stars, comment) values ($1, $2, $3, $4, $5)",
      [o.id, customerId, o.runner_id, stars, comment],
    );
    await logEvent(t, o.id, customerId, "rated", null, null, { stars });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type OrderView = OrderRow & {
  spot_name: string;
  spot_address: string;
  spot_lat: number;
  spot_lng: number;
  spot_notes: string;
  building_name: string;
  building_short: string;
  customer_name: string;
  customer_phone: string | null;
  runner_name: string | null;
  runner_avatar: string | null;
  runner_rating: number | null;
  runner_ratings: number;
};

export const ORDER_VIEW_SQL = `
  select o.*, sp.name as spot_name, sp.address as spot_address, sp.lat as spot_lat, sp.lng as spot_lng,
    sp.pickup_notes as spot_notes, b.name as building_name, b.short_name as building_short,
    c.full_name as customer_name, c.phone as customer_phone,
    r.full_name as runner_name, r.avatar_path as runner_avatar,
    public.runner_rating(o.runner_id) as runner_rating,
    coalesce(public.runner_rating_count(o.runner_id), 0) as runner_ratings
  from public.orders o
  join public.pickup_spots sp on sp.id = o.spot_id
  join public.buildings b on b.id = o.building_id
  join public.profiles c on c.id = o.customer_id
  left join public.profiles r on r.id = o.runner_id`;

export async function getOrderView(t: Queryable, orderId: string) {
  const [o] = await t.query<OrderView>(`${ORDER_VIEW_SQL} where o.id = $1`, [orderId]);
  return o ?? null;
}

export async function orderEvents(t: Queryable, orderId: string) {
  return t.query<{ id: number; type: string; from_status: OrderStatus | null; to_status: OrderStatus | null; data: Record<string, unknown>; created_at: Date; actor_id: string | null }>(
    "select id, type, from_status, to_status, data, created_at, actor_id from public.order_events where order_id = $1 order by id",
    [orderId],
  );
}

export type JobView = OrderView & { building_lat: number; building_lng: number };

/** Open jobs for the board (privileged read; route checks the runner is on shift). */
export async function openJobs(): Promise<JobView[]> {
  const rows = await q<JobView>(
    `select x.*, b2.lat as building_lat, b2.lng as building_lng from (${ORDER_VIEW_SQL} where o.status = 'requested'
       and (o.scheduled_for is null or o.scheduled_for < now() + interval '45 minutes')) x
     join public.buildings b2 on b2.id = x.building_id
     order by x.created_at`,
  );
  return rows;
}

export async function runnerActiveJobs(runnerId: string): Promise<OrderView[]> {
  return q<OrderView>(`${ORDER_VIEW_SQL} where o.runner_id = $1 and o.status = any(array['claimed','picked_up','on_the_way']::public.order_status[]) order by o.eta`, [runnerId]);
}

export const isRunnerActive = (s: OrderStatus) => RUNNER_ACTIVE_STATUSES.includes(s);

export function jobDistance(job: JobView) {
  return haversineMiles({ lat: job.spot_lat, lng: job.spot_lng }, { lat: job.building_lat, lng: job.building_lng });
}

export type { Quote };
