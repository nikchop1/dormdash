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
import { activeSurge, estimateMinutes, formatCents, isQuoteError, quoteDelivery, type PricingSettings, type Quote } from "@/lib/domain/pricing";
import { canMarkNoShow, headsUpCopy, presentButtonVisible, runnerAbsentCaseDue } from "@/lib/domain/handoff";
import { activeFoodCap, runnerLevel, withinLimit, unlockCopy } from "@/lib/domain/levels";
import { unclaimEarnsStrike } from "@/lib/domain/runners";
import { fmtTime } from "@/lib/domain/time";
import { getPayments } from "@/lib/payments";
import { getPricing, getSurgeWindows, flag } from "@/lib/settings";
import { notify, notifyAdmins, notifyOnShiftRunners } from "@/lib/notify";
import { signedUrl } from "@/lib/storage";
import { coverageStatus } from "./coverage";
import { addEarning, issueCredit, ledger, recordPlatformFee, redeemCredit, refundOrder } from "./money";
import { payRunner } from "./payouts";
import { takePhoto } from "./photos";
import { addStrike } from "./strikes";
import { recordIncident } from "./incidents";
import type { SessionUser } from "@/lib/auth/session";

export type OrderRow = {
  id: string;
  code: string;
  customer_id: string;
  runner_id: string | null;
  run_id: string | null;
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
  size_fee_cents: number;
  bag_fee_cents: number;
  bags: number;
  surge_multiplier: number;
  surge_fee_cents: number;
  delivery_fee_cents: number;
  tip_cents: number;
  guarantee_cents: number;
  total_cents: number;
  credit_applied_cents: number;
  charged_cents: number;
  food_value_cents: number;
  food_total_flagged: boolean;
  floor_fee_refunded_cents: number;
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
  heads_up_at: Date | null;
  at_door_at: Date | null;
  door_photo_id: string | null;
  door_location: "in_range" | "out_of_range" | "denied" | "unavailable" | null;
  door_distance_m: number | null;
  countdown_ends_at: Date | null;
  customer_present_at: Date | null;
  runner_absent_case_at: Date | null;
  pin_entered_at: Date | null;
  no_show_at: Date | null;
  payout_review: boolean;
  missing_notified_at: Date | null;
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

export async function runAfter(fns: After[]) {
  for (const f of fns) {
    try {
      await f();
    } catch (e) {
      console.error("[after-commit]", e);
    }
  }
}

export async function lockOrder(t: Queryable, orderId: string): Promise<OrderRow> {
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

export async function logEvent(t: Queryable, orderId: string, actorId: string | null, type: string, from: OrderStatus | null, to: OrderStatus | null, data: object = {}) {
  await t.query(
    "insert into public.order_events (order_id, actor_id, type, from_status, to_status, data) values ($1, $2, $3, $4, $5, $6::jsonb)",
    [orderId, actorId, type, from, to, JSON.stringify(data)],
  );
}

const firstName = (full: string | null | undefined) => (full ?? "").split(" ")[0] || "Someone";

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function quoteFor(input: {
  spotId: string;
  buildingId: string;
  floor: number;
  tipCents: number;
  foodValueCents?: number;
  bags?: number;
  at?: Date;
  creditBalanceCents?: number;
  useCredit?: boolean;
  lobby?: boolean;
}) {
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
  if ((input.bags ?? 1) > settings.maxBags) throw new ApiError(400, "bags", `Up to ${settings.maxBags} bags per order.`);
  const surge = activeSurge(input.at ?? new Date(), windows, settings);
  const quote = quoteDelivery({
    distanceMiles: Number(row.distance_miles),
    floor: input.floor,
    tipCents: input.tipCents,
    surge,
    settings,
    foodValueCents: input.foodValueCents,
    bags: input.bags,
    lobby: input.lobby,
    creditBalanceCents: input.creditBalanceCents,
    useCredit: input.useCredit,
  });
  if (isQuoteError(quote)) {
    throw new ApiError(400, "out_of_range", `That spot is outside our ${quote.maxRadiusMiles} mile delivery radius.`);
  }
  return { quote, settings, surge };
}

/** Can this person place orders right now? */
export function customerBlock(p: SessionUser["profile"]): string | null {
  if (p.status === "banned") return "This account is banned.";
  if (p.flagged_at) return "Your account is under review. An admin will email you when you can order again.";
  if (p.customer_review_required) return "You've missed several handoffs recently, so ordering is paused until an admin reviews your account.";
  return null;
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
  foodValueCents: number;
  bags: number;
  useCredit: boolean;
  scheduledFor: string | null;
  confirmationPhotoId: string;
};

export async function createOrder(user: SessionUser, input: CreateOrderInput) {
  const block = customerBlock(user.profile);
  if (block) throw new ApiError(403, "customer_blocked", block);
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

  const balance = (await q1<{ credit_cents: number }>("select credit_cents from public.profiles where id = $1", [user.id]))?.credit_cents ?? 0;
  const { quote } = await quoteFor({ ...input, at: scheduledFor ?? now, creditBalanceCents: balance, useCredit: input.useCredit });
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
        distance_miles, base_fee_cents, distance_fee_cents, floor_fee_cents, size_fee_cents, bag_fee_cents, bags,
        surge_multiplier, surge_fee_cents, delivery_fee_cents, tip_cents, guarantee_cents, total_cents,
        credit_applied_cents, charged_cents, food_value_cents, platform_fee_cents, runner_fee_cents, payment_provider)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) returning *`,
      [
        code, user.id, input.spotId, input.buildingId, input.floor, input.room, input.pickupName, input.orderNumber, input.notes,
        scheduledFor ? scheduledFor.toISOString() : null,
        quote.distanceMiles, quote.baseFeeCents, quote.distanceFeeCents, quote.floorFeeCents, quote.sizeFeeCents, quote.bagFeeCents, input.bags,
        quote.surgeMultiplier, quote.surgeFeeCents, quote.deliveryFeeCents, quote.tipCents, quote.guaranteeCents, quote.totalCents,
        quote.creditAppliedCents, quote.chargeCents, input.foodValueCents, quote.platformFeeCents, quote.runnerFeeCents,
        quote.chargeCents > 0 ? provider.mode : "credit",
      ],
    );
    await t.query("insert into public.order_secrets (order_id, pin) values ($1, $2)", [o.id, generatePin()]);
    await t.query("update public.photos set order_id = $1 where id = $2", [o.id, input.confirmationPhotoId]);
    await redeemCredit(t, user.id, quote.creditAppliedCents, o.id);
    await logEvent(t, o.id, user.id, "created", null, "pending_payment", { total: quote.totalCents, credit: quote.creditAppliedCents });
    return o;
  });

  // Fully covered by credit: nothing to charge.
  if (order.charged_cents === 0) {
    await markPaid(order.id, null);
    return { orderId: order.id, code: order.code, clientSecret: null, mode: "credit" as const, quote };
  }
  const { ref, clientSecret } = await provider.createCheckout({ orderId: order.id, code: order.code, amountCents: order.charged_cents, customerEmail: user.email });
  await q("update public.orders set payment_ref = $2 where id = $1", [order.id, ref]);
  if (provider.mode === "demo") await capturePayment(order.id, user.id);
  return { orderId: order.id, code: order.code, clientSecret, mode: provider.mode, quote };
}

/** Confirm the card payment and put the order on the board. Idempotent. */
export async function capturePayment(orderId: string, customerId: string | null) {
  const o = await q1<OrderRow>("select * from public.orders where id = $1", [orderId]);
  if (!o || (customerId && o.customer_id !== customerId)) throw new ApiError(404, "not_found", "We couldn't find that order.");
  if (o.status !== "pending_payment") return { status: o.status };
  if (!o.payment_ref) throw new ApiError(409, "no_checkout", "This order has no payment attached. Start a new one.");
  const res = await getPayments().capture(o.payment_ref);
  if (res.status === "pending") return { status: o.status };
  if (res.status !== "succeeded") {
    await q("update public.orders set payment_status = 'failed' where id = $1", [orderId]);
    throw new ApiError(402, "payment_failed", `Payment didn't go through${res.message ? `: ${res.message}` : "."} Try another card.`);
  }
  return markPaid(orderId, res.captureRef ?? null);
}

/** Shared by capturePayment and the Stripe webhook. */
export async function markPaid(orderId: string, captureRef: string | null) {
  const after: After[] = [];
  const result = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.status !== "pending_payment") return { status: o.status };
    const to = step(o, "payment_succeeded", "system");
    await t.query("update public.orders set status = $2, payment_status = 'succeeded', capture_ref = $3 where id = $1", [o.id, to, captureRef]);
    await ledger(t, { orderId: o.id, userId: o.customer_id, kind: "charge", amountCents: o.charged_cents, provider: o.payment_provider, ref: captureRef, memo: `Delivery fee + tip + guarantee, order ${o.code}` });
    await ledger(t, { orderId: o.id, kind: "guarantee_in", amountCents: o.guarantee_cents, memo: `Delivery guarantee, order ${o.code}` });
    await logEvent(t, o.id, null, "paid", o.status, to, { capture: captureRef });
    const scheduled = o.scheduled_for && o.scheduled_for.getTime() - Date.now() > 45 * 60000;
    if (!scheduled) {
      after.push(() => notifyOnShiftRunners({ title: `New job · ${formatCents(o.runner_fee_cents + o.tip_cents)}`, body: `Pickup going to floor ${o.floor}. Open the board to claim it.`, url: "/run" }));
    }
    return { status: to };
  });
  await runAfter(after);
  return result;
}

// ---------------------------------------------------------------------------
// Runner eligibility, levels, runs
// ---------------------------------------------------------------------------

export type RunnerGate = {
  emailVerified: boolean;
  phone: boolean;
  idApproved: boolean;
  payouts: boolean;
  flagged: boolean;
  banned: boolean;
  ok: boolean;
};

export async function runnerGate(runnerId: string, t: Queryable = { query: q }): Promise<RunnerGate> {
  const [p] = await t.query<{ runner_status: string; status: string; phone: string | null; payouts_enabled: boolean; flagged_at: Date | null; email_ok: boolean }>(
    `select p.runner_status, p.status, p.phone, p.payouts_enabled, p.flagged_at,
       coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = p.id), true) as email_ok
     from public.profiles p where p.id = $1`,
    [runnerId],
  );
  const g = {
    emailVerified: !!p?.email_ok,
    phone: !!p?.phone,
    idApproved: p?.runner_status === "approved",
    payouts: !!p?.payouts_enabled,
    flagged: !!p?.flagged_at,
    banned: p?.status === "banned",
  };
  return { ...g, ok: g.emailVerified && g.phone && g.idApproved && g.payouts && !g.flagged && !g.banned };
}

export async function completedDeliveries(t: Queryable, runnerId: string) {
  const [r] = await t.query<{ n: number }>("select count(*)::int as n from public.orders where runner_id = $1 and status = 'delivered'", [runnerId]);
  return r.n;
}

export async function levelFor(t: Queryable, runnerId: string, s: PricingSettings) {
  const [p] = await t.query<{ level_offset: number }>("select level_offset from public.profiles where id = $1", [runnerId]);
  return runnerLevel(await completedDeliveries(t, runnerId), p?.level_offset ?? 0, s.levelTiers);
}

async function assertCanRun(t: Queryable, runnerId: string) {
  const [p] = await t.query<{ on_shift: boolean }>("select on_shift from public.profiles where id = $1 for update", [runnerId]);
  const g = await runnerGate(runnerId, t);
  if (g.banned) throw new ApiError(403, "banned", "This runner account is banned.");
  if (g.flagged) throw new ApiError(403, "flagged", "Your account is under review, so claiming is paused.");
  if (!g.idApproved) throw new ApiError(403, "not_runner", "Only approved runners can claim jobs.");
  if (!g.phone) throw new ApiError(409, "no_phone", "Add a phone number to your profile so customers can reach you during a handoff.");
  if (!g.payouts) throw new ApiError(409, "no_payout", "Set up payouts (bank + identity) before claiming jobs.");
  if (!p?.on_shift) throw new ApiError(409, "off_shift", "Go on shift to claim jobs.");
}

/** The runner's open run, creating one if needed. */
async function openRun(t: Queryable, runnerId: string, opts: { headingHome?: boolean; buildingId?: string | null }) {
  const [r] = await t.query<{ id: string }>("select id from public.runs where runner_id = $1 and closed_at is null order by created_at desc limit 1", [runnerId]);
  if (r) {
    if (opts.headingHome) await t.query("update public.runs set heading_home = true, building_id = coalesce(building_id, $2) where id = $1", [r.id, opts.buildingId ?? null]);
    return r.id;
  }
  const [n] = await t.query<{ id: string }>(
    "insert into public.runs (runner_id, heading_home, building_id) values ($1, $2, $3) returning id",
    [runnerId, !!opts.headingHome, opts.buildingId ?? null],
  );
  return n.id;
}

async function closeRunIfDone(t: Queryable, runId: string | null) {
  if (!runId) return;
  const [r] = await t.query<{ n: number }>("select count(*)::int as n from public.orders where run_id = $1 and status in ('claimed','picked_up','on_the_way')", [runId]);
  if (r.n === 0) await t.query("update public.runs set closed_at = now() where id = $1 and closed_at is null", [runId]);
}

/**
 * Claim one order or a whole suggested run. All-or-nothing. Enforces max active
 * orders, per-order food-value limits by level, and the 2x total food-value cap.
 */
export async function claimOrders(runnerId: string, orderIds: string[], opts: { headingHome?: boolean; buildingId?: string | null } = {}) {
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) throw new ApiError(400, "empty", "Pick at least one job.");
  const settings = await getPricing();
  const after: After[] = [];
  const claimed = await tx(async (t) => {
    await assertCanRun(t, runnerId);
    const active = await t.query<{ food_value_cents: number }>(
      "select food_value_cents from public.orders where runner_id = $1 and status in ('claimed','picked_up','on_the_way')",
      [runnerId],
    );
    if (active.length + ids.length > settings.maxActiveOrders) {
      throw new ApiError(409, "too_many", `You can carry ${settings.maxActiveOrders} at once. You have ${active.length} active, so that's too many.`);
    }
    const lvl = await levelFor(t, runnerId, settings);
    const cap = activeFoodCap(lvl);
    let food = active.reduce((s, a) => s + a.food_value_cents, 0);
    const [runner] = await t.query<{ runner_home_building_id: string | null; full_name: string }>(
      "select runner_home_building_id, full_name from public.profiles where id = $1",
      [runnerId],
    );
    const runId = await openRun(t, runnerId, opts);
    const out: OrderRow[] = [];
    for (const id of ids) {
      const o = await lockOrder(t, id);
      if (o.customer_id === runnerId) throw new ApiError(409, "own_order", "You can't run your own order.");
      if (o.status !== "requested") throw new ApiError(409, "taken", `Order ${o.code} was just grabbed by someone else.`);
      if (!withinLimit(o.food_value_cents, lvl)) {
        throw new ApiError(403, "over_limit", `Order ${o.code} is above your level's food limit. ${unlockCopy(lvl, o.food_value_cents, settings.levelTiers)}.`);
      }
      food += o.food_value_cents;
      if (cap !== null && food > cap) throw new ApiError(409, "food_cap", `That's more than ${formatCents(cap)} of food at once. Take fewer orders.`);
      const to = step(o, "claim", "runner");
      const [b] = await t.query<{ id: string; door_requires_resident: boolean }>("select id, door_requires_resident from public.buildings where id = $1", [o.building_id]);
      const handoff = handoffFor({ id: b.id, doorRequiresResident: b.door_requires_resident }, runner.runner_home_building_id);
      const mins = estimateMinutes(Number(o.distance_miles), o.floor, ids.length);
      const etaBase = Date.now() + mins * 60000;
      const eta = new Date(o.scheduled_for ? Math.max(etaBase, o.scheduled_for.getTime()) : etaBase);
      const [u] = await t.query<OrderRow>(
        "update public.orders set status = $2, runner_id = $3, run_id = $4, handoff = $5, eta = $6, claimed_at = now() where id = $1 returning *",
        [o.id, to, runnerId, runId, handoff, eta.toISOString()],
      );
      if (handoff === "lobby" && u.floor_fee_cents > 0) await removeFloorFee(t, u, settings);
      await logEvent(t, o.id, runnerId, "claimed", o.status, to, { eta: eta.toISOString(), handoff, run: runId, headingHome: !!opts.headingHome });
      out.push(u);
      const first = firstName(runner.full_name);
      after.push(() =>
        notify(o.customer_id, {
          category: "order_updates",
          title: `${first} has your order`,
          body:
            handoff === "lobby"
              ? `ETA ${fmtTime(eta)}. ${first} doesn't live in your building, so you'll meet in the lobby. We refunded the floor fee.`
              : `ETA ${fmtTime(eta)}. Have your PIN ready: no PIN, no handoff.`,
          url: `/orders/${o.id}`,
        }),
      );
    }
    return out;
  });
  await runAfter(after);
  return claimed;
}

/** Lobby handoff: the floor add-on isn't charged. Refund it (and its surge share) the moment it becomes a lobby order. */
async function removeFloorFee(t: Queryable, o: OrderRow, s: PricingSettings) {
  const subtotal = o.base_fee_cents + o.distance_fee_cents + o.size_fee_cents;
  const surged = Math.round(subtotal * Number(o.surge_multiplier));
  const newDelivery = surged + o.bag_fee_cents;
  const diff = o.delivery_fee_cents - newDelivery;
  if (diff <= 0) return;
  const platform = Math.round(newDelivery * s.platformFeePct);
  await t.query(
    `update public.orders set floor_fee_cents = 0, surge_fee_cents = $2, delivery_fee_cents = $3, total_cents = total_cents - $4,
       platform_fee_cents = $5, runner_fee_cents = $6, floor_fee_refunded_cents = $4 where id = $1`,
    [o.id, surged - subtotal, newDelivery, diff, platform, newDelivery - platform],
  );
  // Money back the way it was paid: card first, then credit.
  const cash = await refundOrder(t, o, diff, `Lobby handoff: floor fee, order ${o.code}`);
  if (diff - cash > 0) await issueCredit(t, o.customer_id, diff - cash, o.id, "Lobby handoff: floor fee");
  await logEvent(t, o.id, null, "floor_fee_refunded", null, null, { cents: diff });
}

/** Drop an order from a run before pickup. Repeated drops count as unclaims for strikes. */
export async function unclaimOrder(runnerId: string, orderId: string) {
  const settings = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const to = step(o, "unclaim", "runner");
    if (o.floor_fee_refunded_cents > 0) {
      throw new ApiError(409, "lobby_refunded", "This one's already been repriced for a lobby handoff. Report a problem instead of dropping it.");
    }
    await t.query("update public.orders set status = $2, runner_id = null, run_id = null, handoff = null, eta = null, claimed_at = null where id = $1", [o.id, to]);
    await t.query("insert into public.unclaims (runner_id, order_id) values ($1, $2)", [runnerId, o.id]);
    await logEvent(t, o.id, runnerId, "unclaimed", o.status, to);
    await closeRunIfDone(t, o.run_id);
    const [{ n }] = await t.query<{ n: number }>("select count(*)::int as n from public.unclaims where runner_id = $1 and created_at > now() - interval '7 days'", [runnerId]);
    let strike = false;
    if (unclaimEarnsStrike(n, settings.freeUnclaimsPerWeek)) {
      const s = await addStrike(t, { runnerId, reason: "unclaim", orderId: o.id, note: `Drop #${n} this week`, threshold: settings.strikeThreshold });
      after.push(s.after);
      strike = true;
    }
    after.push(() => notify(o.customer_id, { category: "order_updates", title: "Your runner had to drop this one", body: "It's back on the board for the next runner. Nothing you need to do.", url: `/orders/${o.id}` }));
    after.push(() => notifyOnShiftRunners({ title: "Job back on the board", body: `Going to floor ${o.floor}.`, url: "/run" }, runnerId));
    return { strike, unclaimsThisWeek: n };
  });
  await runAfter(after);
  return res;
}

/** Pickup: requires a live-camera photo of the bag showing the name or order number. */
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
    after.push(() => notify(o.customer_id, { category: "order_updates", title: "Food's picked up", body: "Your runner has the bag. We'll ping you when they're two minutes out.", url: `/orders/${o.id}` }));
    // Last pickup in the run: everyone gets the heads-up automatically.
    if (o.run_id) {
      const [{ n }] = await t.query<{ n: number }>("select count(*)::int as n from public.orders where run_id = $1 and status = 'claimed'", [o.run_id]);
      if (n === 0) after.push(...(await headsUpTx(t, runnerId, o.run_id)));
    }
  });
  await runAfter(after);
}

/** Heads-up for every picked-up order in the run: "about 2 minutes away, have your PIN". */
async function headsUpTx(t: Queryable, runnerId: string, runId: string): Promise<After[]> {
  const orders = await t.query<OrderRow>(
    "select * from public.orders where run_id = $1 and runner_id = $2 and status = 'picked_up' and heads_up_at is null for update",
    [runId, runnerId],
  );
  const after: After[] = [];
  for (const o of orders) {
    const to = step(o, "depart", "system");
    await t.query("update public.orders set status = $2, on_the_way_at = now(), heads_up_at = now() where id = $1", [o.id, to]);
    await logEvent(t, o.id, runnerId, "heads_up", o.status, to, { handoff: o.handoff });
    const copy = headsUpCopy(o.handoff);
    after.push(() => notify(o.customer_id, { category: "order_updates", ...copy, url: `/orders/${o.id}` }));
  }
  if (orders.length) await t.query("update public.runs set heads_up_at = coalesce(heads_up_at, now()) where id = $1", [runId]);
  return after;
}

/** "Heading to building": heads-up to every customer in the run whose food is picked up. */
export async function headingToBuilding(runnerId: string) {
  const after: After[] = [];
  const count = await tx(async (t) => {
    const [r] = await t.query<{ id: string }>("select id from public.runs where runner_id = $1 and closed_at is null order by created_at desc limit 1", [runnerId]);
    if (!r) throw new ApiError(409, "no_run", "You don't have an active run.");
    const fns = await headsUpTx(t, runnerId, r.id);
    after.push(...fns);
    return fns.length;
  });
  await runAfter(after);
  return { notified: count };
}

/**
 * "At your door" / "In the lobby": live-camera photo of the bag with the room number
 * (or lobby) in frame, plus the one-time location result stamped on that photo.
 * Starts the countdown and pushes the photo to the customer.
 */
export async function atDoor(runnerId: string, orderId: string, photoId: string) {
  const s = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    if (o.status !== "picked_up" && o.status !== "on_the_way") throw new ApiError(409, "not_out", "Pick the order up first.");
    if (o.pin_entered_at) throw new ApiError(409, "done", "This one's already handed off.");
    const p = await takePhoto(t, photoId, runnerId, "door");
    await t.query("update public.photos set order_id = $1 where id = $2", [o.id, photoId]);
    const endsAt = new Date(Date.now() + s.doorCountdownSeconds * 1000);
    if (o.status === "picked_up") await t.query("update public.orders set status = 'on_the_way', on_the_way_at = coalesce(on_the_way_at, now()) where id = $1", [o.id]);
    await t.query(
      "update public.orders set at_door_at = now(), door_photo_id = $2, door_location = $3, door_distance_m = $4, countdown_ends_at = $5 where id = $1",
      [o.id, photoId, p.location_status ?? "unavailable", p.distance_m, endsAt.toISOString()],
    );
    await logEvent(t, o.id, runnerId, "at_door", null, null, { location: p.location_status ?? "unavailable", distanceM: p.distance_m, lobby: o.handoff === "lobby" });
    const lobby = o.handoff === "lobby";
    after.push(() =>
      notify(o.customer_id, {
        category: "order_updates",
        title: lobby ? "Your runner is in the lobby" : "Your runner is at your door",
        body: `You have ${Math.round(s.doorCountdownSeconds / 60)} minutes to grab it with your PIN. Open the app to see the photo.`,
        url: `/orders/${o.id}`,
      }),
    );
    return { countdownEndsAt: endsAt, location: p.location_status ?? "unavailable" };
  });
  await runAfter(after);
  return res;
}

/**
 * Call buttons. Numbers are only reachable through these, only during an active
 * order, never rendered as text. Every tap is logged (the runner needs one to mark a no-show).
 */
export async function callParty(userId: string, orderId: string, as: "runner" | "customer") {
  const o = await q1<OrderRow>("select * from public.orders where id = $1", [orderId]);
  if (!o) throw new ApiError(404, "not_found", "We couldn't find that order.");
  if (as === "runner" && o.runner_id !== userId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
  if (as === "customer" && o.customer_id !== userId) throw new ApiError(404, "not_found", "We couldn't find that order.");
  if (!["claimed", "picked_up", "on_the_way"].includes(o.status)) throw new ApiError(410, "closed", "This order is closed, so calling is off.");
  const other = as === "runner" ? o.customer_id : o.runner_id;
  const p = other ? await q1<{ phone: string | null }>("select phone from public.profiles where id = $1", [other]) : null;
  if (!p?.phone) throw new ApiError(409, "no_phone", "We don't have a number for them. Wait a minute and try again.");
  await q("insert into public.call_logs (order_id, caller_id, caller_role) values ($1, $2, $3)", [orderId, userId, as]);
  await logEvent({ query: q }, orderId, userId, "call", null, null, { by: as });
  return { tel: p.phone };
}

/** PIN entry is the ONLY way to complete a delivery. It is the proof of handoff. */
export async function deliverOrder(runnerId: string, orderId: string, pin: string) {
  const settings = await getPricing();
  const after: After[] = [];
  const result = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const to = step(o, "deliver", "runner");
    if (o.pin_attempts >= MAX_PIN_ATTEMPTS) {
      throw new ApiError(423, "pin_locked", "Too many wrong PINs. Call the customer, or wait out the countdown and mark them not here.");
    }
    const [s] = await t.query<{ pin: string }>("select pin from public.order_secrets where order_id = $1", [o.id]);
    if (!s || s.pin !== pin) {
      await t.query("update public.orders set pin_attempts = pin_attempts + 1 where id = $1", [o.id]);
      await logEvent(t, o.id, runnerId, "pin_failed", null, null, { attempt: o.pin_attempts + 1 });
      return { wrongPin: true as const, attemptsLeft: MAX_PIN_ATTEMPTS - o.pin_attempts - 1 };
    }
    await t.query("update public.orders set status = $2, delivered_at = now(), pin_entered_at = now(), delivered_via = 'pin' where id = $1", [o.id, to]);
    o.delivered_at = new Date();
    await logEvent(t, o.id, runnerId, "pin_ok", null, null);
    await logEvent(t, o.id, runnerId, "delivered", o.status, to, { via: "pin" });

    const late = evaluateLateness({ eta: o.eta, deliveredAt: o.delivered_at, deliveryFeeCents: o.delivery_fee_cents, lateRefundedAt: o.late_refunded_at }, new Date(), settings);
    const feeRefunded = !!o.late_refunded_at || late.refundCents > 0;
    if (late.refundCents > 0) {
      const cash = await refundOrder(t, o, late.refundCents, `Late delivery refund, order ${o.code}`);
      if (late.refundCents - cash > 0) await issueCredit(t, o.customer_id, late.refundCents - cash, o.id, "Late delivery: fee paid with credit");
      await t.query("update public.orders set late_refunded_at = now() where id = $1", [o.id]);
      await logEvent(t, o.id, null, "late_refund", null, null, { minutesLate: late.minutesLate, refund: late.refundCents });
      const st = await addStrike(t, { runnerId, reason: "late", orderId: o.id, note: `${late.minutesLate} min past ETA`, threshold: settings.strikeThreshold });
      after.push(st.after);
    }
    if (!feeRefunded) {
      await addEarning(t, { runnerId, orderId: o.id, kind: "delivery_fee", amountCents: o.runner_fee_cents });
      await recordPlatformFee(t, o, o.platform_fee_cents, `Platform fee, order ${o.code}`);
    }
    await addEarning(t, { runnerId, orderId: o.id, kind: "tip", amountCents: o.tip_cents });
    await closeRunIfDone(t, o.run_id);
    after.push(() => payRunner(runnerId, o.id));
    after.push(() =>
      notify(o.customer_id, {
        category: "order_updates",
        title: "Delivered. Enjoy",
        body: late.refundCents > 0 ? "It ran late, so we refunded your delivery fee. Rate your runner when you get a sec." : "Rate your runner when you get a sec.",
        url: `/orders/${o.id}`,
      }),
    );
    return { delivered: true as const, late: late.late, refunded: late.refundCents };
  });
  await runAfter(after);
  return result;
}

/**
 * "Customer not here". The runner gets the ENTIRE delivery fee + 100% of the tip;
 * the customer gets no refund and a no-show incident. If the location check wasn't
 * verified, the payout waits for admin review.
 */
export async function markNoShow(runnerId: string, orderId: string) {
  const settings = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    const [{ calls }] = await t.query<{ calls: number }>("select count(*)::int as calls from public.call_logs where order_id = $1 and caller_role = 'runner'", [o.id]);
    const check = canMarkNoShow(
      { status: o.status, atDoorAt: o.at_door_at, doorPhotoId: o.door_photo_id, doorLocation: o.door_location, countdownEndsAt: o.countdown_ends_at, runnerCalls: calls, customerPresentAt: o.customer_present_at, pinEnteredAt: o.pin_entered_at },
      new Date(),
    );
    if (!check.ok) throw new ApiError(409, "no_show_blocked", check.reason);
    const to = step(o, "no_show", "runner");
    await t.query("update public.orders set status = $2, no_show_at = now(), payout_review = $3 where id = $1", [o.id, to, check.needsReview]);
    await logEvent(t, o.id, runnerId, "customer_no_show", o.status, to, { needsReview: check.needsReview, location: o.door_location });
    await addEarning(t, { runnerId, orderId: o.id, kind: "delivery_fee", amountCents: o.delivery_fee_cents, held: check.needsReview, memo: "Customer not here: full fee" });
    await addEarning(t, { runnerId, orderId: o.id, kind: "tip", amountCents: o.tip_cents, held: check.needsReview, memo: "Customer not here" });
    await closeRunIfDone(t, o.run_id);
    after.push(...(await recordIncident(t, { userId: o.customer_id, role: "customer", type: "no_show", orderId: o.id, counterpartyId: runnerId }, settings)));
    if (check.needsReview) {
      after.push(() => notifyAdmins({ title: "No-show payout needs review", body: `Order ${o.code}: location wasn't verified at the door.`, url: "/admin/cases" }));
    } else {
      after.push(() => payRunner(runnerId, o.id));
    }
    after.push(() =>
      notify(o.customer_id, {
        category: "order_updates",
        title: "Your runner couldn't reach you",
        body: "You weren't at the door with your PIN before the countdown ended, so the runner was paid and there's no refund. They may keep the food.",
        url: `/orders/${o.id}`,
      }),
    );
    return { needsReview: check.needsReview };
  });
  await runAfter(after);
  return res;
}

/** Customer: "I'm at my door and the runner isn't here." Blocks "Customer not here". */
export async function customerPresent(customerId: string, orderId: string) {
  const s = await getPricing();
  const after: After[] = [];
  await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.customer_id !== customerId) throw new ApiError(404, "not_found", "We couldn't find that order.");
    if (!presentButtonVisible({ atDoorAt: o.at_door_at, countdownEndsAt: o.countdown_ends_at, pinEnteredAt: o.pin_entered_at, customerPresentAt: o.customer_present_at, status: o.status }, new Date(), s.presentWindowAfterSeconds)) {
      throw new ApiError(409, "not_now", "That button isn't available right now.");
    }
    await t.query("update public.orders set customer_present_at = now() where id = $1", [o.id]);
    await logEvent(t, o.id, customerId, "customer_present", null, null);
    if (o.runner_id) {
      const rid = o.runner_id;
      after.push(() => notify(rid, { category: "order_updates", title: "The customer is at the door now", body: `Floor ${o.floor}, room ${o.room}. Get the PIN and hand over the bag.`, url: "/run/active" }));
    }
  });
  await runAfter(after);
}

// ---------------------------------------------------------------------------
// Cancellation (customer before pickup, admin, system)
// ---------------------------------------------------------------------------

export async function cancelOrder(actorId: string | null, actor: Actor, orderId: string, reason: string) {
  const settings = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (actor === "customer" && o.customer_id !== actorId) throw new ApiError(404, "not_found", "We couldn't find that order.");
    const paidTotal = o.charged_cents + o.credit_applied_cents;
    // Already given back: cash refunds plus any credit issued on this order (e.g. a lobby floor-fee refund paid as credit).
    const [{ credited }] = await t.query<{ credited: number }>("select coalesce(sum(amount_cents), 0)::int as credited from public.ledger where order_id = $1 and kind = 'credit_issued'", [o.id]);
    const terms = cancellationTerms(
      { status: o.status, totalCents: paidTotal, refundedCents: o.refunded_cents + credited, createdAt: o.created_at },
      actor,
      new Date(),
      settings,
    );
    if (!terms.allowed) throw new ApiError(409, "cannot_cancel", terms.reason);
    const to = step(o, "cancel", actor);
    // Back the way it was paid: card first, the rest as credit.
    const cash = o.status === "pending_payment" ? 0 : await refundOrder(t, o, terms.refundCents, `Cancelled, order ${o.code}`);
    const creditBack = o.status === "pending_payment" ? o.credit_applied_cents : Math.max(0, terms.refundCents - cash);
    await issueCredit(t, o.customer_id, creditBack, o.id, "Order cancelled");
    if (o.status !== "pending_payment") await ledger(t, { orderId: o.id, kind: "guarantee_in", amountCents: -o.guarantee_cents, memo: `Guarantee returned, order ${o.code} cancelled` });
    await t.query("update public.orders set status = $2, cancelled_at = now(), cancelled_by = $3, cancel_reason = $4 where id = $1", [o.id, to, actor, reason.slice(0, 200)]);
    if (terms.runnerFeeCents > 0 && o.runner_id) {
      await addEarning(t, { runnerId: o.runner_id, orderId: o.id, kind: "cancellation_fee", amountCents: terms.runnerFeeCents, memo: "Customer cancelled after claim" });
      const rid = o.runner_id;
      after.push(() => payRunner(rid, o.id));
    }
    await closeRunIfDone(t, o.run_id);
    await logEvent(t, o.id, actorId, "cancelled", o.status, to, { by: actor, kind: terms.kind, refund: cash, credit: creditBack, runnerFee: terms.runnerFeeCents });
    if (o.runner_id && o.status !== "requested") {
      const runnerId = o.runner_id;
      after.push(() =>
        notify(runnerId, {
          category: "order_updates",
          title: `Order ${o.code} was cancelled`,
          body: terms.runnerFeeCents > 0 ? `Don't pick it up. You still get a ${formatCents(terms.runnerFeeCents)} cancellation fee.` : "Don't pick it up.",
          url: "/run",
        }),
      );
    }
    if (actor !== "customer") {
      after.push(() =>
        notify(o.customer_id, { category: "order_updates", title: `Order ${o.code} was cancelled`, body: cash + creditBack > 0 ? `We refunded ${formatCents(cash + creditBack)}. ${reason}` : reason, url: `/orders/${o.id}` }),
      );
    }
    return { refundedCents: cash, creditCents: creditBack, runnerFeeCents: terms.runnerFeeCents, kind: terms.kind };
  });
  await runAfter(after);
  return res;
}

export async function rateOrder(customerId: string, orderId: string, stars: number, comment: string) {
  await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.customer_id !== customerId) throw new ApiError(404, "not_found", "We couldn't find that order.");
    if (o.status !== "delivered" || !o.runner_id) throw new ApiError(409, "not_delivered", "You can rate once it's delivered.");
    const [existing] = await t.query("select 1 from public.ratings where order_id = $1", [o.id]);
    if (existing) throw new ApiError(409, "already_rated", "You already rated this one. Thanks!");
    await t.query("insert into public.ratings (order_id, customer_id, runner_id, stars, comment) values ($1, $2, $3, $4, $5)", [o.id, customerId, o.runner_id, stars, comment]);
    await logEvent(t, o.id, customerId, "rated", null, null, { stars });
  });
}

// ---------------------------------------------------------------------------
// Sweeps used by cron and by pages (time-based rules)
// ---------------------------------------------------------------------------

/** After "I'm at my door", no PIN within the grace period opens a runner incident case. */
export async function runnerAbsentSweep(now = new Date()) {
  const s = await getPricing();
  const rows = await q<OrderRow>(
    "select * from public.orders where customer_present_at is not null and pin_entered_at is null and runner_absent_case_at is null and status in ('picked_up','on_the_way')",
  );
  let opened = 0;
  for (const o of rows) {
    if (!runnerAbsentCaseDue({ customerPresentAt: o.customer_present_at, pinEnteredAt: o.pin_entered_at, status: o.status }, now, s.runnerAbsentGraceSeconds)) continue;
    const { openCase } = await import("./cases");
    await openCase({ type: "runner_not_at_door", orderId: o.id, openedBy: null, reason: "customer_at_door_runner_absent", description: "The customer said they were at their door and no PIN was entered in time." }).catch(() => {});
    opened++;
  }
  return { opened };
}

// ---------------------------------------------------------------------------
// Reads (privacy: first names only, never phone/email/last name)
// ---------------------------------------------------------------------------

export type OrderView = OrderRow & {
  spot_name: string;
  spot_address: string;
  spot_lat: number;
  spot_lng: number;
  spot_notes: string;
  building_name: string;
  building_short: string;
  building_lat: number;
  building_lng: number;
  building_radius_m: number;
  customer_first: string;
  runner_first: string | null;
  runner_avatar: string | null;
  runner_rating: number | null;
  runner_ratings: number;
};

export const ORDER_VIEW_SQL = `
  select o.*, sp.name as spot_name, sp.address as spot_address, sp.lat as spot_lat, sp.lng as spot_lng,
    sp.pickup_notes as spot_notes, b.name as building_name, b.short_name as building_short,
    b.lat as building_lat, b.lng as building_lng, b.handoff_radius_m as building_radius_m,
    split_part(c.full_name, ' ', 1) as customer_first,
    split_part(r.full_name, ' ', 1) as runner_first, r.avatar_path as runner_avatar,
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

export type JobView = OrderView;

/** Open jobs for the board (privileged read; the route checks the runner is on shift). */
export async function openJobs(): Promise<JobView[]> {
  return q<JobView>(
    `${ORDER_VIEW_SQL} where o.status = 'requested' and (o.scheduled_for is null or o.scheduled_for < now() + interval '45 minutes') order by o.created_at`,
  );
}

export async function runnerActiveJobs(runnerId: string): Promise<OrderView[]> {
  return q<OrderView>(`${ORDER_VIEW_SQL} where o.runner_id = $1 and o.status = any(array['claimed','picked_up','on_the_way']::public.order_status[]) order by o.floor`, [runnerId]);
}

/** Everything on the runner's current run, including stops already finished. */
export async function currentRun(runnerId: string) {
  const run = await q1<{ id: string; heading_home: boolean; heads_up_at: Date | null; building_id: string | null }>(
    "select id, heading_home, heads_up_at, building_id from public.runs where runner_id = $1 and closed_at is null order by created_at desc limit 1",
    [runnerId],
  );
  if (!run) return null;
  const orders = await q<OrderView>(`${ORDER_VIEW_SQL} where o.run_id = $1 order by o.floor`, [run.id]);
  const calls = await q<{ order_id: string; n: number }>(
    "select order_id, count(*)::int as n from public.call_logs where caller_role = 'runner' and order_id in (select id from public.orders where run_id = $1) group by order_id",
    [run.id],
  );
  const doorPhotos = Object.fromEntries(
    await Promise.all(
      orders
        .filter((o) => o.door_photo_id)
        .map(async (o) => {
          const p = await q1<{ bucket: "order-photos"; path: string }>("select bucket, path from public.photos where id = $1 and deleted_at is null", [o.door_photo_id]);
          return [o.id, p ? await signedUrl(p.bucket, p.path) : null] as const;
        }),
    ),
  );
  return { run, orders, calls: Object.fromEntries(calls.map((c) => [c.order_id, c.n])) as Record<string, number>, doorPhotos: doorPhotos as Record<string, string | null> };
}

export const isRunnerActive = (s: OrderStatus) => RUNNER_ACTIVE_STATUSES.includes(s);

export function jobDistance(job: JobView) {
  return haversineMiles({ lat: job.spot_lat, lng: job.spot_lng }, { lat: job.building_lat, lng: job.building_lng });
}

export const paymentsLive = () => paymentsMode === "stripe";

export type { Quote };
