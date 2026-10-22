import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { call, fixtures, freshDb, loginAs, makeUser, photo, tinyPng } from "./harness";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { POST as quoteRoute } from "@/app/api/quote/route";
import { POST as cancelRoute } from "@/app/api/orders/[id]/cancel/route";
import { POST as rateRoute } from "@/app/api/orders/[id]/rate/route";
import { POST as disputeRoute } from "@/app/api/orders/[id]/dispute/route";
import { POST as claimRoute } from "@/app/api/runner/claim/route";
import { POST as jobAction } from "@/app/api/runner/jobs/[id]/[action]/route";
import { POST as uploadRoute } from "@/app/api/uploads/route";
import { POST as resolveRoute } from "@/app/api/admin/disputes/[id]/route";
import { GET as cronLate } from "@/app/api/cron/late/route";
import { GET as cronUnclaimed } from "@/app/api/cron/unclaimed/route";
import { lateSweep, unclaimedSweep } from "@/lib/services/cron";
import { runPayouts } from "@/lib/services/payouts";

let db: Db;
let f: Awaited<ReturnType<typeof fixtures>>;
let u: Record<string, string>;

beforeAll(async () => {
  db = await freshDb();
  f = await fixtures(db);
  u = {
    cust: await makeUser(db, "cust@nyu.edu", { building: f.tower, floor: 14 }),
    cust2: await makeUser(db, "cust2@nyu.edu", { building: f.mercer, floor: 3 }),
    maya: await makeUser(db, "maya@nyu.edu", { building: f.tower, runner: "approved", home: f.tower, onShift: true }),
    sam: await makeUser(db, "sam@nyu.edu", { building: f.mercer, runner: "approved", home: f.mercer, onShift: true }),
    admin: await makeUser(db, "admin@nyu.edu", { building: f.tower, admin: true }),
  };
});

async function place(email: string, userId: string, over: Record<string, unknown> = {}) {
  await db.query("delete from public.rate_limits"); // this suite places more orders than the per-user limit allows
  await loginAs(email, email);
  const r = await call<{ orderId: string; error?: { message: string } }>(createOrderRoute, {
    body: { spotId: f.near, pickupName: "Test T", orderNumber: "42", buildingId: f.tower, floor: 14, room: "1412", notes: "", tipCents: 200, scheduledFor: null, confirmationPhotoId: await photo(db, userId, "confirmation"), ...over },
  });
  return r;
}

const order = async (id: string) => (await db.query<Record<string, unknown>>("select * from public.orders where id = $1", [id]))[0];
const pinOf = async (id: string) => (await db.query<{ pin: string }>("select pin from public.order_secrets where order_id = $1", [id]))[0].pin;

describe("pricing is computed server-side", () => {
  it("quote matches the fee rules (0.11 mi -> +$1, floor 14 -> +$1)", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const r = await call<{ quote: { deliveryFeeCents: number; distanceMiles: number } }>(quoteRoute, { body: { spotId: f.near, buildingId: f.tower, floor: 14, tipCents: 0 } });
    expect(r.status).toBe(200);
    expect(r.body.quote.distanceMiles).toBeGreaterThan(0.1);
    expect(r.body.quote.deliveryFeeCents % 25).toBe(0);
  });

  it("refuses spots beyond the radius and disabled dining halls", async () => {
    await loginAs("cust", "cust@nyu.edu");
    expect((await call(quoteRoute, { body: { spotId: f.far, buildingId: f.tower, floor: 3 } })).status).toBe(400);
    expect((await call(quoteRoute, { body: { spotId: f.hall, buildingId: f.tower, floor: 3 } })).status).toBe(400);
  });

  it("ignores any price the client sends", async () => {
    const r = await place("cust@nyu.edu", u.cust, { totalCents: 1, deliveryFeeCents: 1 });
    const o = await order(r.body.orderId);
    expect(o.total_cents).toBeGreaterThan(100);
    expect(Number(o.delivery_fee_cents) + Number(o.tip_cents)).toBe(o.total_cents);
    await db.query("update public.orders set status = 'cancelled' where id = $1", [r.body.orderId]);
  });

  it("requires a confirmation screenshot that belongs to you", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const r = await call(createOrderRoute, {
      body: { spotId: f.near, pickupName: "X", buildingId: f.tower, floor: 14, room: "1", tipCents: 0, scheduledFor: null, confirmationPhotoId: await photo(db, u.cust2, "confirmation") },
    });
    expect(r.status).toBe(400);
  });
});

describe("full delivery: order -> claim -> pickup -> PIN -> rating", () => {
  let id: string;
  it("places a demo-paid order that lands on the board", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    expect(r.status).toBe(200);
    id = r.body.orderId;
    const o = await order(id);
    expect(o.status).toBe("requested");
    expect(o.payment_status).toBe("succeeded");
    const [charge] = await db.query<{ amount_cents: number }>("select amount_cents from public.ledger where order_id = $1 and kind = 'charge'", [id]);
    expect(charge.amount_cents).toBe(o.total_cents);
    // runners on shift were notified
    const n = await db.query("select 1 from public.notifications where user_id = $1 and category = 'new_jobs'", [u.maya]);
    expect(n.length).toBeGreaterThan(0);
  });

  it("runner claims it: ETA set, door handoff for a resident runner", async () => {
    await loginAs("maya", "maya@nyu.edu");
    const r = await call(claimRoute, { body: { orderIds: [id] } });
    expect(r.status).toBe(200);
    const o = await order(id);
    expect(o.status).toBe("claimed");
    expect(o.runner_id).toBe(u.maya);
    expect(o.handoff).toBe("door");
    expect(o.eta).toBeInstanceOf(Date);
  });

  it("a second runner can't grab it", async () => {
    await loginAs("sam", "sam@nyu.edu");
    const r = await call(claimRoute, { body: { orderIds: [id] } });
    expect(r.status).toBe(409);
  });

  it("pickup needs the runner's own bag photo", async () => {
    await loginAs("maya", "maya@nyu.edu");
    expect((await call(jobAction, { body: {}, params: { id, action: "pickup" } })).status).toBe(400);
    const r = await call(jobAction, { body: { photoId: await photo(db, u.maya, "pickup") }, params: { id, action: "pickup" } });
    expect(r.status).toBe(200);
    expect((await order(id)).status).toBe("picked_up");
  });

  it("customer can't cancel after pickup", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const r = await call(cancelRoute, { body: {}, params: { id } });
    expect(r.status).toBe(409);
  });

  it("wrong PIN is rejected and logged; right PIN delivers and pays the runner", async () => {
    await loginAs("maya", "maya@nyu.edu");
    await call(jobAction, { body: {}, params: { id, action: "depart" } });
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
    const events = await db.query<{ type: string }>("select type from public.order_events where order_id = $1 order by id", [id]);
    expect(events.map((e) => e.type)).toEqual(["created", "paid", "claimed", "picked_up", "on_the_way", "pin_failed", "pin_ok", "delivered"]);
    const earnings = await db.query<{ kind: string; amount_cents: number }>("select kind, amount_cents from public.runner_earnings where order_id = $1 order by kind", [id]);
    expect(earnings).toEqual([
      { kind: "delivery_fee", amount_cents: o.runner_fee_cents },
      { kind: "tip", amount_cents: 200 },
    ]);
    const [fee] = await db.query<{ amount_cents: number }>("select amount_cents from public.ledger where order_id = $1 and kind = 'platform_fee'", [id]);
    expect(fee.amount_cents).toBe(o.platform_fee_cents);
  });

  it("customer rates once", async () => {
    await loginAs("cust", "cust@nyu.edu");
    expect((await call(rateRoute, { body: { stars: 5, comment: "fast" }, params: { id } })).status).toBe(200);
    expect((await call(rateRoute, { body: { stars: 4 }, params: { id } })).status).toBe(409);
  });

  it("problem report + admin resolution refunds the fee and claws it back from the runner", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const needsPhoto = await call(disputeRoute, { body: { reason: "wrong_items", description: "Wrong bag entirely, different name." }, params: { id } });
    expect(needsPhoto.status).toBe(400);
    const r = await call<{ disputeId: string }>(disputeRoute, { body: { reason: "wrong_items", description: "Wrong bag entirely, different name.", photoId: await photo(db, u.cust, "dispute") }, params: { id } });
    expect(r.status).toBe(200);
    await loginAs("admin", "admin@nyu.edu");
    const res = await call(resolveRoute, { body: { actions: ["refund_fee", "strike"], note: "Pickup photo shows another name." }, params: { id: r.body.disputeId } });
    expect(res.status).toBe(200);
    const o = await order(id);
    expect(o.refunded_cents).toBe(o.delivery_fee_cents);
    expect(o.payment_status).toBe("partially_refunded");
    const [{ sum }] = await db.query<{ sum: number }>("select sum(amount_cents)::int as sum from public.runner_earnings where order_id = $1", [id]);
    expect(sum).toBe(200); // only the tip remains
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from public.strikes where runner_id = $1 and reason = 'dispute'", [u.maya]);
    expect(n).toBe(1);
  });
});

describe("cancellations", () => {
  it("free before claim: full refund", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const c = await call<{ refundedCents: number; runnerFeeCents: number }>(cancelRoute, { body: {}, params: { id: r.body.orderId } });
    expect(c.status).toBe(200);
    const o = await order(r.body.orderId);
    expect(c.body.refundedCents).toBe(o.total_cents);
    expect(o.status).toBe("cancelled");
    expect(o.payment_status).toBe("refunded");
  });

  it("after claim: refund minus the runner's $0.50", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const id = r.body.orderId;
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [id] } });
    expect((await order(id)).handoff).toBe("lobby"); // Sam lives in Mercer
    await loginAs("cust", "cust@nyu.edu");
    const c = await call<{ refundedCents: number; runnerFeeCents: number }>(cancelRoute, { body: {}, params: { id } });
    const o = await order(id);
    expect(c.body.runnerFeeCents).toBe(50);
    expect(c.body.refundedCents).toBe(Number(o.total_cents) - 50);
    const [e] = await db.query<{ kind: string; amount_cents: number }>("select kind, amount_cents from public.runner_earnings where order_id = $1", [id]);
    expect(e).toEqual({ kind: "cancellation_fee", amount_cents: 50 });
  });

  it("other customers can't cancel your order", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    await loginAs("cust2", "cust2@nyu.edu");
    expect((await call(cancelRoute, { body: {}, params: { id: r.body.orderId } })).status).toBe(404);
    await db.query("update public.orders set status = 'cancelled' where id = $1", [r.body.orderId]);
  });
});

describe("unclaims, late refunds, strikes and auto-suspension", () => {
  it("first unclaim of the week is free, the second is a strike", async () => {
    const a = await place("cust@nyu.edu", u.cust);
    const b = await place("cust@nyu.edu", u.cust);
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [a.body.orderId, b.body.orderId] } });
    expect((await order(a.body.orderId)).batch_id).toBeTruthy();
    const first = await call<{ strike: boolean }>(jobAction, { body: {}, params: { id: a.body.orderId, action: "unclaim" } });
    expect(first.body.strike).toBe(false);
    expect((await order(a.body.orderId)).status).toBe("requested");
    const second = await call<{ strike: boolean }>(jobAction, { body: {}, params: { id: b.body.orderId, action: "unclaim" } });
    expect(second.body.strike).toBe(true);
  });

  it("cron refunds the fee once an order is 15+ minutes past ETA, and strikes the runner", async () => {
    const r = await place("cust@nyu.edu", u.cust);
    const id = r.body.orderId;
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [id] } });
    await db.query("update public.orders set eta = now() - interval '16 minutes' where id = $1", [id]);
    const res = await lateSweep();
    expect(res.refunded).toBe(1);
    const o = await order(id);
    expect(o.refunded_cents).toBe(o.delivery_fee_cents);
    expect(o.late_refunded_at).toBeTruthy();
    // Running it again doesn't double-refund.
    expect((await lateSweep()).refunded).toBe(0);
    // Delivering now pays the runner the tip only.
    await call(jobAction, { body: { photoId: await photo(db, u.sam, "pickup") }, params: { id, action: "pickup" } });
    await call(jobAction, { body: { pin: await pinOf(id) }, params: { id, action: "deliver" } });
    const earnings = await db.query<{ kind: string }>("select kind from public.runner_earnings where order_id = $1", [id]);
    expect(earnings.map((e) => e.kind)).toEqual(["tip"]);
  });

  it("third strike auto-suspends the runner and takes them off shift", async () => {
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from public.strikes where runner_id = $1 and not voided", [u.sam]);
    expect(n).toBe(2); // unclaim + late
    const r = await place("cust@nyu.edu", u.cust);
    await loginAs("sam", "sam@nyu.edu");
    await call(claimRoute, { body: { orderIds: [r.body.orderId] } });
    await db.query("update public.orders set eta = now() - interval '30 minutes' where id = $1", [r.body.orderId]);
    await lateSweep();
    const [p] = await db.query<{ runner_status: string; on_shift: boolean }>("select runner_status, on_shift from public.profiles where id = $1", [u.sam]);
    expect(p).toEqual({ runner_status: "suspended", on_shift: false });
    const blocked = await call(claimRoute, { body: { orderIds: [r.body.orderId] } });
    expect(blocked.status).toBe(403);
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

describe("payouts", () => {
  it("pays available balances once past the hold, and only once", async () => {
    await db.query("update public.runner_earnings set available_at = now() - interval '1 minute'");
    const first = await runPayouts();
    expect(first.paid).toBeGreaterThanOrEqual(1);
    const payouts = await db.query<{ status: string; amount_cents: number }>("select status, amount_cents from public.payouts");
    expect(payouts.every((p) => p.status === "paid" && p.amount_cents > 0)).toBe(true);
    expect((await runPayouts()).paid).toBe(0);
  });
});

describe("rate limits", () => {
  it("caps order creation per user", async () => {
    await db.query("delete from public.rate_limits");
    await loginAs("spammer", "cust2@nyu.edu");
    let last = 0;
    for (let i = 0; i < 9; i++) {
      const r = await call(createOrderRoute, { body: { spotId: f.near } }); // invalid body, but the limit is checked first
      last = r.status;
    }
    expect(last).toBe(429);
    await db.query("delete from public.rate_limits");
  });
});

describe("uploads and cron security", () => {
  it("accepts a real image and rejects non-images", async () => {
    await loginAs("cust", "cust@nyu.edu");
    const good = new FormData();
    good.append("file", new File([tinyPng() as BlobPart], "a.png", { type: "image/png" }));
    good.append("kind", "confirmation");
    expect((await call(uploadRoute, { form: good })).status).toBe(200);
    const bad = new FormData();
    bad.append("file", new File(["<script>alert(1)</script>"], "a.png", { type: "image/png" }));
    bad.append("kind", "confirmation");
    expect((await call(uploadRoute, { form: bad })).status).toBe(415);
    const runnerOnly = new FormData();
    runnerOnly.append("file", new File([tinyPng() as BlobPart], "a.png", { type: "image/png" }));
    runnerOnly.append("kind", "pickup");
    expect((await call(uploadRoute, { form: runnerOnly })).status).toBe(403);
  });

  it("cron routes require the secret", async () => {
    const no = await cronLate(new Request("http://localhost/api/cron/late"));
    expect(no.status).toBe(401);
    const yes = await cronUnclaimed(new Request("http://localhost/api/cron/unclaimed", { headers: { authorization: "Bearer local-cron-secret" } }));
    expect(yes.status).toBe(200);
  });
});
