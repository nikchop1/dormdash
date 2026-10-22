import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { call, fixtures, freshDb, loginAs, makeUser, photo, tinyJpeg, tinyPng } from "./harness";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { POST as quoteRoute } from "@/app/api/quote/route";
import { POST as cancelRoute } from "@/app/api/orders/[id]/cancel/route";
import { POST as rateRoute } from "@/app/api/orders/[id]/rate/route";
import { POST as presentRoute } from "@/app/api/orders/[id]/present/route";
import { POST as customerCaseRoute } from "@/app/api/orders/[id]/cases/route";
import { POST as claimRoute } from "@/app/api/runner/claim/route";
import { POST as jobAction } from "@/app/api/runner/jobs/[id]/[action]/route";
import { POST as uploadRoute } from "@/app/api/uploads/route";
import { POST as cameraToken } from "@/app/api/camera/token/route";
import { POST as cameraUpload } from "@/app/api/camera/upload/route";
import { POST as resolveRoute } from "@/app/api/admin/cases/[id]/route";
import { POST as noShowReviewRoute } from "@/app/api/admin/orders/[id]/no-show-review/route";
import { GET as cronLate } from "@/app/api/cron/late/route";
import { GET as cronUnclaimed } from "@/app/api/cron/unclaimed/route";
import { lateSweep, unclaimedSweep } from "@/lib/services/cron";
import { runnerAbsentSweep } from "@/lib/services/orders";

let db: Db;
let f: Awaited<ReturnType<typeof fixtures>>;
let u: Record<string, string>;

beforeAll(async () => {
  db = await freshDb();
  f = await fixtures(db);
  u = {
    cust: await makeUser(db, "cust@nyu.edu", { building: f.tower, floor: 14 }),
    cust2: await makeUser(db, "cust2@nyu.edu", { building: f.mercer, floor: 3 }),
    cust3: await makeUser(db, "cust3@nyu.edu", { building: f.tower, floor: 4 }),
    maya: await makeUser(db, "maya@nyu.edu", { building: f.tower, runner: "approved", home: f.tower, onShift: true }),
    sam: await makeUser(db, "sam@nyu.edu", { building: f.mercer, runner: "approved", home: f.mercer, onShift: true }),
    nopay: await makeUser(db, "nopay@nyu.edu", { building: f.tower, runner: "approved", home: f.tower, onShift: true, payouts: false }),
    admin: await makeUser(db, "admin@nyu.edu", { building: f.tower, admin: true }),
  };
});

async function place(email: string, userId: string, over: Record<string, unknown> = {}) {
  await db.query("delete from public.rate_limits"); // this suite places more orders than the per-user limit allows
  // Customers can have 3 orders in flight; park old unclaimed ones so each test starts clean.
  await db.query("update public.orders set status = 'cancelled' where customer_id = $1 and status = 'requested'", [userId]);
  await loginAs(email, email);
  return call<{ orderId: string; error?: { message: string } }>(createOrderRoute, {
    body: {
      spotId: f.near, pickupName: "Test T", orderNumber: "42", buildingId: f.tower, floor: 14, room: "1412", notes: "", tipCents: 200,
      foodValueCents: 1500, bags: 1, useCredit: true, scheduledFor: null, confirmationPhotoId: await photo(db, userId, "confirmation"), ...over,
    },
  });
}

const order = async (id: string) => (await db.query<Record<string, unknown>>("select * from public.orders where id = $1", [id]))[0];
const pinOf = async (id: string) => (await db.query<{ pin: string }>("select pin from public.order_secrets where order_id = $1", [id]))[0].pin;
const profile = async (id: string) => (await db.query<Record<string, unknown>>("select * from public.profiles where id = $1", [id]))[0];

/** Claim, pick up (live photo), arrive at the door (live photo + location). */
async function toDoor(runnerEmail: string, runnerId: string, id: string, location: "in_range" | "out_of_range" | "denied" = "in_range") {
  await loginAs(runnerEmail, runnerEmail);
  expect((await call(claimRoute, { body: { orderIds: [id] } })).status).toBe(200);
  expect((await call(jobAction, { body: { photoId: await photo(db, runnerId, "pickup") }, params: { id, action: "pickup" } })).status).toBe(200);
  const r = await call(jobAction, { body: { photoId: await photo(db, runnerId, "door", location) }, params: { id, action: "at-door" } });
  expect(r.status).toBe(200);
}

describe("pricing is computed server-side", () => {
  it("quote matches the fee rules and adds the delivery guarantee as its own line", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const r = await call<{ quote: { deliveryFeeCents: number; distanceMiles: number; guaranteeCents: number; totalCents: number; tipCents: number } }>(quoteRoute, {
      body: { spotId: f.near, buildingId: f.tower, floor: 14, tipCents: 0, foodValueCents: 1500 },
    });
    expect(r.status).toBe(200);
    expect(r.body.quote.distanceMiles).toBeGreaterThan(0.1);
    expect(r.body.quote.deliveryFeeCents % 25).toBe(0);
    expect(r.body.quote.guaranteeCents).toBe(10);
    expect(r.body.quote.totalCents).toBe(r.body.quote.deliveryFeeCents + r.body.quote.guaranteeCents);
  });

  it("bigger food totals and extra bags cost more", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const fee = async (foodValueCents: number, bags = 1) =>
      (await call<{ quote: { deliveryFeeCents: number } }>(quoteRoute, { body: { spotId: f.near, buildingId: f.tower, floor: 14, tipCents: 0, foodValueCents, bags } })).body.quote.deliveryFeeCents;
    const small = await fee(1200);
    expect(await fee(2500)).toBe(small + 50);
    expect(await fee(6000)).toBe(small + 150);
    expect(await fee(1200, 3)).toBe(small + 100);
  });

  it("refuses spots beyond the radius and disabled dining halls", async () => {
    await loginAs("cust", "cust@nyu.edu");
    expect((await call(quoteRoute, { body: { spotId: f.far, buildingId: f.tower, floor: 3, foodValueCents: 1000 } })).status).toBe(400);
    expect((await call(quoteRoute, { body: { spotId: f.hall, buildingId: f.tower, floor: 3, foodValueCents: 1000 } })).status).toBe(400);
  });

  it("ignores any price the client sends and requires the food total", async () => {
    const r = await place("cust@nyu.edu", u.cust, { totalCents: 1, deliveryFeeCents: 1 });
    const o = await order(r.body.orderId);
    expect(Number(o.delivery_fee_cents) + Number(o.tip_cents) + Number(o.guarantee_cents)).toBe(o.total_cents);
    expect(o.food_value_cents).toBe(1500);
    const missing = await place("cust@nyu.edu", u.cust, { foodValueCents: undefined });
    expect(missing.status).toBe(400);
  });

  it("requires a confirmation screenshot that belongs to you", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const r = await call(createOrderRoute, {
      body: { spotId: f.near, pickupName: "X", buildingId: f.tower, floor: 14, room: "1", tipCents: 0, foodValueCents: 1000, scheduledFor: null, confirmationPhotoId: await photo(db, u.cust2, "confirmation") },
    });
    expect(r.status).toBe(400);
  });
});

describe("runner gate and levels", () => {
  it("a runner without Stripe payouts can't claim", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    await loginAs("nopay", "nopay@nyu.edu");
    const c = await call<{ error: { code: string } }>(claimRoute, { body: { orderIds: [r.body.orderId] } });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe("no_payout");
  });

  it("a level-1 runner can't take an order above $20 of food", async () => {
    const r = await place("cust@nyu.edu", u.cust, { foodValueCents: 2600 });
    await loginAs("maya", "maya@nyu.edu");
    const c = await call(claimRoute, { body: { orderIds: [r.body.orderId] } });
    expect(c.status).toBe(403);
    expect(JSON.stringify(c.body)).toMatch(/deliveries/);
  });
});

describe("full delivery: order -> claim -> pickup -> door -> PIN -> paid", () => {
  let id: string;
  it("places a demo-paid order that lands on the board", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    expect(r.status).toBe(200);
    id = r.body.orderId;
    const o = await order(id);
    expect(o.status).toBe("requested");
    expect(o.payment_status).toBe("succeeded");
    const ledger = await db.query<{ kind: string; amount_cents: number }>("select kind, amount_cents from public.ledger where order_id = $1 order by id", [id]);
    expect(ledger).toEqual([
      { kind: "charge", amount_cents: o.charged_cents },
      { kind: "guarantee_in", amount_cents: 10 },
    ]);
    const n = await db.query("select 1 from public.notifications where user_id = $1 and category = 'new_jobs'", [u.maya]);
    expect(n.length).toBeGreaterThan(0);
  });

  it("runner claims it into a run: ETA set, door handoff for a resident runner", async () => {
    await loginAs("maya", "maya@nyu.edu");
    const r = await call(claimRoute, { body: { orderIds: [id] } });
    expect(r.status).toBe(200);
    const o = await order(id);
    expect(o.status).toBe("claimed");
    expect(o.runner_id).toBe(u.maya);
    expect(o.run_id).toBeTruthy();
    expect(o.handoff).toBe("door");
    expect(o.eta).toBeInstanceOf(Date);
  });

  it("a second runner can't grab it", async () => {
    await loginAs("sam", "sam@nyu.edu");
    expect((await call(claimRoute, { body: { orderIds: [id] } })).status).toBe(409);
  });

  it("pickup needs a live-camera photo; gallery photos are refused", async () => {
    await loginAs("maya", "maya@nyu.edu");
    expect((await call(jobAction, { body: {}, params: { id, action: "pickup" } })).status).toBe(400);
    const [gallery] = await db.query<{ id: string }>(
      "insert into public.photos (kind, bucket, path, uploaded_by, via_camera) values ('pickup', 'order-photos', 'x/gallery.jpg', $1, false) returning id",
      [u.maya],
    );
    const refused = await call<{ error: { code: string } }>(jobAction, { body: { photoId: gallery.id }, params: { id, action: "pickup" } });
    expect(refused.body.error.code).toBe("camera_required");
    const r = await call(jobAction, { body: { photoId: await photo(db, u.maya, "pickup") }, params: { id, action: "pickup" } });
    expect(r.status).toBe(200);
    // Last pickup of the run: the customer got the heads-up automatically.
    const o = await order(id);
    expect(o.status).toBe("on_the_way");
    expect(o.heads_up_at).toBeTruthy();
  });

  it("customer can't cancel after pickup", async () => {
    await loginAs("cust", "cust@nyu.edu");
    expect((await call(cancelRoute, { body: {}, params: { id } })).status).toBe(409);
  });

  it("at the door: live photo with location, countdown starts", async () => {
    await loginAs("maya", "maya@nyu.edu");
    const r = await call<{ countdownEndsAt: string; location: string }>(jobAction, { body: { photoId: await photo(db, u.maya, "door") }, params: { id, action: "at-door" } });
    expect(r.status).toBe(200);
    expect(r.body.location).toBe("in_range");
    const o = await order(id);
    expect(o.door_photo_id).toBeTruthy();
    expect(new Date(o.countdown_ends_at as Date).getTime()).toBeGreaterThan(Date.now() + 170_000);
  });

  it("no-show is blocked while the countdown runs", async () => {
    const r = await call(jobAction, { body: {}, params: { id, action: "no-show" } });
    expect(r.status).toBe(409);
  });

  it("wrong PIN is rejected and logged; right PIN delivers and pays the runner immediately", async () => {
    const pin = await pinOf(id);
    const wrong = pin === "0000" ? "1111" : "0000";
    const bad = await call(jobAction, { body: { pin: wrong }, params: { id, action: "deliver" } });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/4 tries left/);
    const good = await call(jobAction, { body: { pin }, params: { id, action: "deliver" } });
    expect(good.status).toBe(200);
    const o = await order(id);
    expect(o.status).toBe("delivered");
    expect(o.delivered_via).toBe("pin");
    expect(o.pin_entered_at).toBeTruthy();
    const events = await db.query<{ type: string }>("select type from public.order_events where order_id = $1 order by id", [id]);
    expect(events.map((e) => e.type)).toEqual(["created", "paid", "claimed", "picked_up", "heads_up", "at_door", "pin_failed", "pin_ok", "delivered"]);
    const earnings = await db.query<{ kind: string; amount_cents: number; payout_id: string | null }>("select kind, amount_cents, payout_id from public.runner_earnings where order_id = $1 order by kind", [id]);
    expect(earnings.map((e) => [e.kind, e.amount_cents])).toEqual([
      ["delivery_fee", o.runner_fee_cents],
      ["tip", 200],
    ]);
    // No hold: transferred the moment the PIN was entered.
    expect(earnings.every((e) => e.payout_id)).toBe(true);
    const [p] = await db.query<{ status: string; amount_cents: number }>("select status, amount_cents from public.payouts where id = $1", [earnings[0].payout_id]);
    expect(p).toEqual({ status: "paid", amount_cents: Number(o.runner_fee_cents) + 200 });
  });

  it("customer rates once", async () => {
    await loginAs("cust", "cust@nyu.edu");
    expect((await call(rateRoute, { body: { stars: 5, comment: "fast" }, params: { id } })).status).toBe(200);
    expect((await call(rateRoute, { body: { stars: 4 }, params: { id } })).status).toBe(409);
  });

  it("a theft claim on a PIN-completed order is rejected automatically", async () => {
    const r = await call<{ caseId: string; autoRejected: boolean }>(customerCaseRoute, { body: { type: "customer_claim", reason: "stolen", description: "Never got it." }, params: { id } });
    expect(r.status).toBe(200);
    expect(r.body.autoRejected).toBe(true);
    const [inc] = await db.query<{ type: string }>("select type from public.incidents where case_id = $1", [r.body.caseId]);
    expect(inc.type).toBe("rejected_claim");
  });

  it("'I gave my PIN but didn't get my food' opens a top-priority case within the window", async () => {
    const r = await call<{ caseId: string; autoRejected: boolean }>(customerCaseRoute, { body: { type: "pin_no_food", description: "Runner walked off with it." }, params: { id } });
    expect(r.status).toBe(200);
    expect(r.body.autoRejected).toBe(false);
    const [c] = await db.query<{ priority: number; status: string }>("select priority, status from public.cases where id = $1", [r.body.caseId]);
    expect(c).toEqual({ priority: 1, status: "open" });
    // Pending incident on both parties until an admin decides.
    const inc = await db.query<{ user_id: string; pending: boolean }>("select user_id, pending from public.incidents where case_id = $1 order by role", [r.body.caseId]);
    expect(inc.map((i) => i.pending)).toEqual([true, true]);
    u.theftCase = r.body.caseId;
  });

  it("admin confirms theft: refund (cash + food credit), ban, identity block, earnings deducted", async () => {
    await loginAs("admin", "admin@nyu.edu");
    const before = await order(id);
    const res = await call<{ cash: number; credit: number }>(resolveRoute, { body: { outcome: "confirm_theft", note: "Door photo shows a different door." }, params: { id: u.theftCase } });
    expect(res.status).toBe(200);
    // Delivery fee + tip + guarantee back to the card; food value as credit.
    expect(res.body.cash).toBe(Number(before.charged_cents));
    expect(res.body.credit).toBe(1500);
    expect((await profile(u.cust)).credit_cents).toBe(1500);
    const runner = await profile(u.maya);
    expect(runner.status).toBe("banned");
    const blocked = await db.query<{ kind: string }>("select kind from public.blocked_identities where case_id = $1 order by kind", [u.theftCase]);
    expect(blocked.map((b) => b.kind)).toContain("email");
    const [out] = await db.query<{ amount_cents: number }>("select coalesce(sum(amount_cents),0)::int as amount_cents from public.ledger where order_id = $1 and kind = 'guarantee_out'", [id]);
    expect(out.amount_cents).toBeGreaterThan(0);
    // Customer incident voided, runner's kept.
    const inc = await db.query<{ role: string; voided: boolean }>("select role, voided from public.incidents where case_id = $1 and type = 'pin_no_food' order by role", [u.theftCase]);
    expect(inc).toEqual([
      { role: "customer", voided: true },
      { role: "runner", voided: false },
    ]);
    // Restore Maya for the rest of the suite.
    await db.query("update public.profiles set status = 'active', banned_at = null, runner_status = 'approved', on_shift = true, level_offset = 0 where id = $1", [u.maya]);
    await db.query("delete from public.blocked_identities");
  });
});

describe("credits", () => {
  it("credit pays delivery fee and tip at checkout and comes back on cancel", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const o = await order(r.body.orderId);
    expect(Number(o.credit_applied_cents)).toBe(Number(o.total_cents) - Number(o.guarantee_cents) > 1500 ? 1500 : Number(o.total_cents) - Number(o.guarantee_cents));
    expect(Number(o.charged_cents)).toBe(Number(o.total_cents) - Number(o.credit_applied_cents));
    const left = Number((await profile(u.cust)).credit_cents);
    expect(left).toBe(1500 - Number(o.credit_applied_cents));
    expect((await call(cancelRoute, { body: {}, params: { id: r.body.orderId } })).status).toBe(200);
    expect((await profile(u.cust)).credit_cents).toBe(1500);
  });

  it("customers can turn credit off for an order", async () => {
    const r = await place("cust@nyu.edu", u.cust, { useCredit: false });
    const o = await order(r.body.orderId);
    expect(o.credit_applied_cents).toBe(0);
    await call(cancelRoute, { body: {}, params: { id: r.body.orderId } });
    await db.query("update public.profiles set credit_cents = 0 where id = $1", [u.cust]);
  });
});

describe("customer not here", () => {
  it("needs the countdown to end and a call; then the runner gets the full fee + tip, customer gets nothing back", async () => {
    const r = await place("cust3@nyu.edu", u.cust3, { floor: 4, room: "401" });
    const id = r.body.orderId;
    await toDoor("maya@nyu.edu", u.maya, id);
    await db.query("update public.orders set countdown_ends_at = now() - interval '1 second' where id = $1", [id]);
    const noCall = await call(jobAction, { body: {}, params: { id, action: "no-show" } });
    expect(noCall.status).toBe(409);
    expect(JSON.stringify(noCall.body)).toMatch(/Call the customer/);
    expect((await call<{ tel: string }>(jobAction, { body: {}, params: { id, action: "call" } })).status).toBe(200);
    const ok = await call<{ needsReview: boolean }>(jobAction, { body: {}, params: { id, action: "no-show" } });
    expect(ok.status).toBe(200);
    expect(ok.body.needsReview).toBe(false);
    const o = await order(id);
    expect(o.status).toBe("customer_no_show");
    expect(o.refunded_cents).toBe(0);
    const earned = await db.query<{ kind: string; amount_cents: number; payout_id: string | null }>("select kind, amount_cents, payout_id from public.runner_earnings where order_id = $1 order by kind", [id]);
    expect(earned.map((e) => [e.kind, e.amount_cents])).toEqual([
      ["delivery_fee", o.delivery_fee_cents],
      ["tip", 200],
    ]);
    expect(earned.every((e) => e.payout_id)).toBe(true);
    const [inc] = await db.query<{ type: string }>("select type from public.incidents where order_id = $1 and user_id = $2", [id, u.cust3]);
    expect(inc.type).toBe("no_show");
  });

  it("unverified location holds the payout for admin review", async () => {
    const r = await place("cust3@nyu.edu", u.cust3, { floor: 4, room: "401" });
    const id = r.body.orderId;
    await toDoor("maya@nyu.edu", u.maya, id, "denied");
    await db.query("update public.orders set countdown_ends_at = now() - interval '1 second' where id = $1", [id]);
    await call(jobAction, { body: {}, params: { id, action: "call" } });
    const res = await call<{ needsReview: boolean }>(jobAction, { body: {}, params: { id, action: "no-show" } });
    expect(res.body.needsReview).toBe(true);
    const held = await db.query<{ held: boolean; payout_id: string | null }>("select held, payout_id from public.runner_earnings where order_id = $1", [id]);
    expect(held.every((h) => h.held && !h.payout_id)).toBe(true);
    await loginAs("admin", "admin@nyu.edu");
    expect((await call(noShowReviewRoute, { body: { approve: true }, params: { id } })).status).toBe(200);
    const paid = await db.query<{ payout_id: string | null }>("select payout_id from public.runner_earnings where order_id = $1", [id]);
    expect(paid.every((p) => p.payout_id)).toBe(true);
  });

  it("three no-shows pause ordering until an admin reviews", async () => {
    const r = await place("cust3@nyu.edu", u.cust3, { floor: 4, room: "401" });
    const id = r.body.orderId;
    await toDoor("maya@nyu.edu", u.maya, id);
    await db.query("update public.orders set countdown_ends_at = now() - interval '1 second' where id = $1", [id]);
    await call(jobAction, { body: {}, params: { id, action: "call" } });
    await call(jobAction, { body: {}, params: { id, action: "no-show" } });
    expect((await profile(u.cust3)).customer_review_required).toBe(true);
    const blocked = await place("cust3@nyu.edu", u.cust3, { floor: 4, room: "401" });
    expect(blocked.status).toBe(403);
    await db.query("update public.profiles set customer_review_required = false where id = $1", [u.cust3]);
  });

  it("'I'm at my door' blocks a no-show and opens a case if no PIN follows", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const id = r.body.orderId;
    await toDoor("maya@nyu.edu", u.maya, id);
    await loginAs("cust", "cust@nyu.edu");
    expect((await call(presentRoute, { body: {}, params: { id } })).status).toBe(200);
    await loginAs("maya", "maya@nyu.edu");
    await db.query("update public.orders set countdown_ends_at = now() - interval '1 second' where id = $1", [id]);
    await call(jobAction, { body: {}, params: { id, action: "call" } });
    const blocked = await call(jobAction, { body: {}, params: { id, action: "no-show" } });
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(blocked.body)).toMatch(/at their door/);
    await db.query("update public.orders set customer_present_at = now() - interval '4 minutes' where id = $1", [id]);
    expect((await runnerAbsentSweep()).opened).toBe(1);
    const [c] = await db.query<{ type: string; priority: number }>("select type, priority from public.cases where order_id = $1", [id]);
    expect(c).toEqual({ type: "runner_not_at_door", priority: 2 });
    // Hand it over so Maya's run closes.
    await call(jobAction, { body: { pin: await pinOf(id) }, params: { id, action: "deliver" } });
  });
});

describe("runner problem reports", () => {
  it("refunds the customer (fees to card, food as credit) and ends the order", async () => {
    const r = await place("cust@nyu.edu", u.cust, { foodValueCents: 1200 });
    const id = r.body.orderId;
    await loginAs("maya", "maya@nyu.edu");
    await call(claimRoute, { body: { orderIds: [id] } });
    const res = await call<{ cashCents: number; creditCents: number; penalty: boolean }>(jobAction, {
      body: { reason: "restaurant_not_ready", note: "Closed early tonight.", photoId: await photo(db, u.maya, "problem") },
      params: { id, action: "problem" },
    });
    expect(res.status).toBe(200);
    expect(res.body.creditCents).toBe(1200);
    expect(res.body.penalty).toBe(false);
    const o = await order(id);
    expect(o.status).toBe("cancelled");
    expect(o.refunded_cents).toBe(o.charged_cents);
    await db.query("update public.profiles set credit_cents = 0 where id = $1", [u.cust]);
  });
});

describe("cancellations and lobby handoffs", () => {
  it("free before claim: full refund", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const c = await call<{ refundedCents: number }>(cancelRoute, { body: {}, params: { id: r.body.orderId } });
    expect(c.status).toBe(200);
    const o = await order(r.body.orderId);
    expect(c.body.refundedCents).toBe(o.charged_cents);
    expect(o.status).toBe("cancelled");
    expect(o.payment_status).toBe("refunded");
  });

  it("a non-resident runner means a lobby handoff, and the floor fee is refunded at claim", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const id = r.body.orderId;
    const before = await order(id);
    expect(Number(before.floor_fee_cents)).toBe(100);
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [id] } });
    const o = await order(id);
    expect(o.handoff).toBe("lobby");
    expect(o.floor_fee_cents).toBe(0);
    expect(o.floor_fee_refunded_cents).toBe(100);
    expect(o.refunded_cents).toBe(100);
    u.lobbyOrder = id;
  });

  it("after claim: refund minus the runner's $0.50", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const id = u.lobbyOrder;
    const c = await call<{ refundedCents: number; runnerFeeCents: number }>(cancelRoute, { body: {}, params: { id } });
    const o = await order(id);
    expect(c.body.runnerFeeCents).toBe(50);
    expect(c.body.refundedCents + 100).toBe(Number(o.charged_cents) - 50);
    const [e] = await db.query<{ kind: string; amount_cents: number }>("select kind, amount_cents from public.runner_earnings where order_id = $1", [id]);
    expect(e).toEqual({ kind: "cancellation_fee", amount_cents: 50 });
  });

  it("other customers can't cancel your order", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    await loginAs("cust2", "cust2@nyu.edu");
    expect((await call(cancelRoute, { body: {}, params: { id: r.body.orderId } })).status).toBe(404);
  });
});

describe("drops, late refunds, strikes and auto-suspension", () => {
  it("first drop of the week is free, the second is a strike", async () => {
    const a = await place("cust2@nyu.edu", u.cust2, { buildingId: f.mercer, floor: 3, room: "301" });
    const b = await place("cust3@nyu.edu", u.cust3, { floor: 14, room: "1401" });
    await loginAs("sam", "sam@nyu.edu");
    expect((await call(claimRoute, { body: { orderIds: [a.body.orderId, b.body.orderId] } })).status).toBe(200);
    expect((await order(a.body.orderId)).run_id).toBe((await order(b.body.orderId)).run_id);
    const first = await call<{ strike: boolean }>(jobAction, { body: {}, params: { id: a.body.orderId, action: "drop" } });
    expect(first.body.strike).toBe(false);
    expect((await order(a.body.orderId)).status).toBe("requested");
    // b was repriced for a lobby handoff, so it can't simply be dropped.
    expect((await call(jobAction, { body: {}, params: { id: b.body.orderId, action: "drop" } })).status).toBe(409);
    await call(claimRoute, { body: { orderIds: [a.body.orderId] } });
    const second = await call<{ strike: boolean }>(jobAction, { body: {}, params: { id: a.body.orderId, action: "drop" } });
    expect(second.body.strike).toBe(true);
    await db.query("update public.orders set status = 'cancelled' where id = $1", [b.body.orderId]);
  });

  it("cron refunds the fee once an order is 15+ minutes past ETA, and strikes the runner", async () => {
    const r = await place("cust2@nyu.edu", u.cust2, { buildingId: f.mercer, floor: 3, room: "301" });
    const id = r.body.orderId;
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [id] } });
    await db.query("update public.orders set eta = now() - interval '16 minutes' where id = $1", [id]);
    expect((await lateSweep()).refunded).toBe(1);
    const o = await order(id);
    expect(o.refunded_cents).toBe(o.delivery_fee_cents);
    expect(o.late_refunded_at).toBeTruthy();
    expect((await lateSweep()).refunded).toBe(0);
    await call(jobAction, { body: { photoId: await photo(db, u.sam, "pickup") }, params: { id, action: "pickup" } });
    await call(jobAction, { body: { pin: await pinOf(id) }, params: { id, action: "deliver" } });
    const earnings = await db.query<{ kind: string }>("select kind from public.runner_earnings where order_id = $1", [id]);
    expect(earnings.map((e) => e.kind)).toEqual(["tip"]);
  });

  it("third strike auto-suspends the runner and takes them off shift", async () => {
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from public.strikes where runner_id = $1 and not voided", [u.sam]);
    expect(n).toBe(2); // drop + late
    const r = await place("cust2@nyu.edu", u.cust2, { buildingId: f.mercer, floor: 3, room: "301" });
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [r.body.orderId] } });
    await db.query("update public.orders set eta = now() - interval '30 minutes' where id = $1", [r.body.orderId]);
    await lateSweep();
    const [p] = await db.query<{ runner_status: string; on_shift: boolean }>("select runner_status, on_shift from public.profiles where id = $1", [u.sam]);
    expect(p).toEqual({ runner_status: "suspended", on_shift: false });
    expect((await call(claimRoute, { body: { orderIds: [r.body.orderId] } })).status).toBe(403);
  });
});

describe("unclaimed timers", () => {
  it("pings runners at 10 min and offers a refund-cancel at 20", async () => {
    const r = await place("cust2@nyu.edu", u.cust2, { buildingId: f.mercer, floor: 3, room: "301" });
    await db.query("update public.orders set created_at = now() - interval '21 minutes' where id = $1", [r.body.orderId]);
    const res = await unclaimedSweep();
    expect(res.pinged).toBeGreaterThanOrEqual(1);
    expect(res.prompted).toBeGreaterThanOrEqual(1);
    const o = await order(r.body.orderId);
    expect(o.runner_pinged_at).toBeTruthy();
    expect(o.cancel_prompted_at).toBeTruthy();
  });
});

describe("rate limits", () => {
  it("caps order creation per user", async () => {
    await db.query("delete from public.rate_limits");
    await loginAs("spammer", "cust2@nyu.edu");
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await call(createOrderRoute, { body: { spotId: f.near } })).status; // invalid body, but the limit is checked first
    expect(last).toBe(429);
    await db.query("delete from public.rate_limits");
  });
});

describe("photos and cron security", () => {
  it("gallery uploads accept receipts and refuse evidence kinds", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const good = new FormData();
    good.append("file", new File([tinyPng() as BlobPart], "a.png", { type: "image/png" }));
    good.append("kind", "confirmation");
    expect((await call(uploadRoute, { form: good })).status).toBe(200);
    const bad = new FormData();
    bad.append("file", new File(["<script>alert(1)</script>"], "a.png", { type: "image/png" }));
    bad.append("kind", "confirmation");
    expect((await call(uploadRoute, { form: bad })).status).toBe(415);
    for (const kind of ["pickup", "door", "dropoff"]) {
      const ev = new FormData();
      ev.append("file", new File([tinyJpeg() as BlobPart], "a.jpg", { type: "image/jpeg" }));
      ev.append("kind", kind);
      const r = await call<{ error: { code: string } }>(uploadRoute, { form: ev });
      expect(r.body.error.code).toBe("camera_required");
    }
  });

  it("live-camera upload needs a one-time token, rejects EXIF photos, and stamps location", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const id = r.body.orderId;
    await loginAs("maya", "maya@nyu.edu");
    await call(claimRoute, { body: { orderIds: [id] } });
    const form = (token: string, bytes: Uint8Array) => {
      const fd = new FormData();
      fd.append("file", new File([bytes as BlobPart], "c.jpg", { type: "image/jpeg" }));
      fd.append("meta", JSON.stringify({ kind: "pickup", token, orderId: id, location: { status: "ok", lat: 40.7323, lng: -73.9967 } }));
      return fd;
    };
    expect((await call(cameraUpload, { form: form("not-a-real-token", tinyJpeg()) })).status).toBe(400);
    const t1 = await call<{ token: string }>(cameraToken, { body: { kind: "pickup" } });
    const exif = Uint8Array.from([...tinyJpeg().subarray(0, 2), 0xff, 0xe1, 0x00, 0x10, ...Buffer.from("Exif\0\0"), ...tinyJpeg().subarray(2)]);
    expect((await call(cameraUpload, { form: form(t1.body.token, exif) })).status).toBe(400);
    const t2 = await call<{ token: string }>(cameraToken, { body: { kind: "pickup" } });
    const ok = await call<{ id: string; location: string }>(cameraUpload, { form: form(t2.body.token, tinyJpeg()) });
    expect(ok.status).toBe(200);
    expect(ok.body.location).toBe("in_range");
    // Tokens are single-use.
    expect((await call(cameraUpload, { form: form(t2.body.token, tinyJpeg()) })).status).toBe(400);
    expect((await call(jobAction, { body: { photoId: ok.body.id }, params: { id, action: "pickup" } })).status).toBe(200);
  });

  it("cron routes require the secret", async () => {
    expect((await cronLate(new Request("http://localhost/api/cron/late"))).status).toBe(401);
    const yes = await cronUnclaimed(new Request("http://localhost/api/cron/unclaimed", { headers: { authorization: "Bearer local-cron-secret" } }));
    expect(yes.status).toBe(200);
  });
});
