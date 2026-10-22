/**
 * Seed Dormdash with demo data.
 *
 *   npm run db:seed                 # full demo: places, users, shifts, orders
 *   npm run db:seed -- --places-only  # just buildings + pickup spots (safe for production)
 *   npm run db:seed -- --force        # re-run even if demo users exist
 *
 * Works against the local PGlite database or a real Supabase project
 * (DATABASE_URL + Supabase keys set), creating auth users the right way for each.
 */
import { randomUUID } from "node:crypto";
import { getDb, migrate } from "@/lib/db";
import { dbMode } from "@/lib/env";
import { getAuth } from "@/lib/auth";
import { recomputeDistances } from "@/lib/services/places";
import { activeSurge, DEFAULT_PRICING, estimateMinutes, isQuoteError, quoteDelivery, type SurgeWindow } from "@/lib/domain/pricing";
import { haversineMiles, roundMiles } from "@/lib/domain/geo";
import { fromNyWallClock, nyParts } from "@/lib/domain/time";
import { putObject } from "@/lib/storage";
import { bagPng, doorPng, idPng, receiptPng } from "./png";

export const DEMO_PASSWORD = "Dormdash123";

const args = new Set(process.argv.slice(2));

// Deterministic randomness so every seed looks the same.
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const BUILDINGS = [
  { key: "tower", name: "Tower Hall", short: "Tower", address: "Placeholder: W 10th St & 5th Ave (verify before launch)", lat: 40.7339, lng: -73.9962, floors: 16 },
  { key: "mercer", name: "Mercer House", short: "Mercer", address: "Placeholder: Mercer St & W 3rd St (verify before launch)", lat: 40.7287, lng: -73.9967, floors: 8 },
];

// Placeholder spots around Washington Square Park. Names are generic on purpose:
// Dormdash has no partnerships, so real names and exact coordinates must be
// verified by an admin before launch.
const SPOTS: { name: string; address: string; lat: number; lng: number; type: "restaurant" | "cafe" | "convenience" | "dining_hall"; notes: string }[] = [
  { name: "University Place Coffee", address: "University Pl near E 9th St", lat: 40.7327, lng: -73.9946, type: "cafe", notes: "Pickup shelf to the left of the register." },
  { name: "Waverly Bagel Co.", address: "Waverly Pl near Mercer St", lat: 40.7305, lng: -73.9958, type: "cafe", notes: "Ask at the second register for pickups." },
  { name: "Mercer Street Deli", address: "Mercer St near W 3rd St", lat: 40.7283, lng: -73.9962, type: "convenience", notes: "Orders bagged behind the counter. Open late." },
  { name: "West 4th Dumpling House", address: "W 4th St near Mercer St", lat: 40.7297, lng: -73.9952, type: "restaurant", notes: "Pickup window by the door." },
  { name: "MacDougal Falafel", address: "MacDougal St near W 3rd St", lat: 40.7302, lng: -74.0003, type: "restaurant", notes: "Say the pickup name at the counter." },
  { name: "Bleecker Slice Shop", address: "Bleecker St near LaGuardia Pl", lat: 40.7280, lng: -73.9989, type: "restaurant", notes: "Pickup boxes on the top rack." },
  { name: "Fifth Ave Poke Bar", address: "5th Ave near W 12th St", lat: 40.7350, lng: -73.9945, type: "restaurant", notes: "Pickup counter at the back." },
  { name: "Greene Street Ramen", address: "Greene St near W 8th St", lat: 40.7312, lng: -73.9943, type: "restaurant", notes: "Text the restaurant if the bag isn't out." },
  { name: "8th Street Corner Store", address: "W 8th St near 5th Ave", lat: 40.7323, lng: -73.9967, type: "convenience", notes: "Snacks, drinks, late-night basics." },
  { name: "LaGuardia Taqueria", address: "LaGuardia Pl near W 3rd St", lat: 40.7289, lng: -73.9984, type: "restaurant", notes: "Ring the bell at the pickup window." },
  { name: "Weinstein Dining (example)", address: "University Pl near E 11th St", lat: 40.7331, lng: -73.9936, type: "dining_hall", notes: "Dining halls are off until NYU policy is confirmed." },
];

type Person = { key: string; email: string; name: string; phone: string; building: string; floor: number; room: string; role: "admin" | "runner" | "pending" | "customer"; home?: string; onShift?: boolean };

const PEOPLE: Person[] = [
  { key: "admin", email: "admin@nyu.edu", name: "Ada Okonkwo", phone: "+12125550100", building: "tower", floor: 3, room: "305", role: "admin" },
  { key: "r1", email: "runner1@nyu.edu", name: "Maya Chen", phone: "+12125550101", building: "tower", floor: 14, room: "1407", role: "runner", home: "tower", onShift: true },
  { key: "r2", email: "runner2@nyu.edu", name: "Diego Ruiz", phone: "+12125550102", building: "tower", floor: 9, room: "912", role: "runner", home: "tower" },
  { key: "r3", email: "runner3@nyu.edu", name: "Priya Patel", phone: "+12125550103", building: "mercer", floor: 5, room: "504", role: "runner", home: "mercer", onShift: true },
  { key: "r4", email: "runner4@nyu.edu", name: "Sam Okafor", phone: "+12125550104", building: "mercer", floor: 2, room: "211", role: "runner", home: "mercer" },
  { key: "pending", email: "pending@nyu.edu", name: "Leo Park", phone: "+12125550105", building: "tower", floor: 11, room: "1103", role: "pending" },
  { key: "c1", email: "customer1@nyu.edu", name: "Jordan Lee", phone: "+12125550111", building: "tower", floor: 14, room: "1412", role: "customer" },
  { key: "c2", email: "customer2@nyu.edu", name: "Ava Thompson", phone: "+12125550112", building: "tower", floor: 7, room: "708", role: "customer" },
  { key: "c3", email: "customer3@nyu.edu", name: "Noah Kim", phone: "+12125550113", building: "mercer", floor: 6, room: "602", role: "customer" },
  { key: "c4", email: "customer4@nyu.edu", name: "Zoe Martinez", phone: "+12125550114", building: "tower", floor: 12, room: "1209", role: "customer" },
  { key: "c5", email: "customer5@nyu.edu", name: "Ethan Brooks", phone: "+12125550115", building: "mercer", floor: 3, room: "317", role: "customer" },
  { key: "c6", email: "customer6@nyu.edu", name: "Lily Nguyen", phone: "+12125550116", building: "tower", floor: 16, room: "1601", role: "customer" },
];

async function main() {
  const db = await getDb();
  if (dbMode === "postgres") {
    const applied = await migrate(db, { local: false });
    if (applied.length) console.log("Applied migrations:", applied.join(", "));
  }

  // ---------- places ----------
  const existingB = await db.query<{ id: string; name: string }>("select id, name from public.buildings");
  const bIds: Record<string, string> = {};
  for (const b of BUILDINGS) {
    const found = existingB.find((x) => x.name === b.name);
    if (found) {
      bIds[b.key] = found.id;
      continue;
    }
    const [row] = await db.query<{ id: string }>(
      "insert into public.buildings (name, short_name, address, lat, lng, floor_count, door_requires_resident) values ($1,$2,$3,$4,$5,$6,true) returning id",
      [b.name, b.short, b.address, b.lat, b.lng, b.floors],
    );
    bIds[b.key] = row.id;
  }
  const existingS = await db.query<{ id: string; name: string }>("select id, name from public.pickup_spots");
  const sIds: string[] = [];
  for (const s of SPOTS) {
    const found = existingS.find((x) => x.name === s.name);
    if (found) {
      sIds.push(found.id);
      continue;
    }
    const [row] = await db.query<{ id: string }>(
      "insert into public.pickup_spots (name, address, lat, lng, type, pickup_notes, verify_before_launch) values ($1,$2,$3,$4,$5,$6,true) returning id",
      [s.name, s.address, s.lat, s.lng, s.type, s.notes],
    );
    sIds.push(row.id);
  }
  await recomputeDistances(db);
  console.log(`Places: ${BUILDINGS.length} buildings, ${SPOTS.length} pickup spots.`);
  if (args.has("--places-only")) return;

  // ---------- people ----------
  const already = await db.query("select 1 from public.profiles where email = 'admin@nyu.edu'");
  if (already.length && !args.has("--force")) {
    console.log("Demo users already exist. Run with --force to add more demo orders anyway, or reset the database.");
    return;
  }
  const auth = getAuth();
  const uid: Record<string, string> = {};
  for (const p of PEOPLE) {
    const existing = await db.query<{ id: string }>("select id from public.profiles where email = $1", [p.email]);
    uid[p.key] =
      existing[0]?.id ??
      (await auth.createConfirmedUser({
        email: p.email,
        password: DEMO_PASSWORD,
        metadata: { full_name: p.name, phone: p.phone, building_id: bIds[p.building], floor: String(p.floor), room: p.room, terms_accepted: "true" },
      }));
    // Runners get a demo Stripe Connect account with payouts enabled (the demo provider simulates Connect).
    await db.query(
      `update public.profiles set is_admin = $2, runner_status = $3, runner_home_building_id = $4, on_shift = $5,
         on_shift_since = case when $5 then now() - interval '40 minutes' end, stripe_account_id = $6, payouts_enabled = $6::text is not null where id = $1`,
      [
        uid[p.key],
        p.role === "admin",
        p.role === "runner" ? "approved" : p.role === "pending" ? "pending" : "none",
        p.home ? bIds[p.home] : null,
        !!p.onShift,
        p.role === "runner" ? `acct_demo_${p.key}` : null,
      ],
    );
  }

  // Runner applications: approved ones + the pending one.
  for (const p of PEOPLE.filter((x) => x.role === "runner" || x.role === "pending")) {
    const path = `${uid[p.key]}/id_card/${randomUUID()}.png`;
    await putObject("id-photos", path, idPng(), "image/png");
    await db.query("insert into public.photos (kind, bucket, path, uploaded_by) values ('id_card', 'id-photos', $1, $2)", [path, uid[p.key]]);
    await db.query(
      `insert into public.runner_applications (user_id, legal_name, nyu_id_number, home_building_id, id_photo_path, agreement_accepted_at, status, reviewed_by, reviewed_at, created_at)
       values ($1, $2, $3, $4, $5, now() - interval '20 days', $6, $7, $8, now() - interval '21 days')`,
      [
        uid[p.key], p.name, `N${10000000 + PEOPLE.indexOf(p) * 1234567}`.slice(0, 9), bIds[p.home ?? p.building], path,
        p.role === "runner" ? "approved" : "pending", p.role === "runner" ? uid.admin : null, p.role === "runner" ? new Date(Date.now() - 20 * 864e5).toISOString() : null,
      ],
    );
  }
  await db.query("update public.runner_applications set created_at = now() - interval '2 hours' where user_id = $1", [uid.pending]);

  // ---------- shifts: evenings, thin on mornings and Monday ----------
  const shiftPlan: Record<string, { days: number[]; hours: number[] }> = {
    r1: { days: [0, 1, 2, 3, 4, 5, 6], hours: [18, 19, 20, 21, 22, 23] },
    r2: { days: [2, 3, 4, 5], hours: [20, 21, 22, 23, 0] },
    r3: { days: [0, 2, 4, 5, 6], hours: [12, 13, 19, 20, 21, 22] },
    r4: { days: [3, 4, 5, 6], hours: [11, 12, 13, 21, 22, 23, 0, 1] },
  };
  for (const [k, plan] of Object.entries(shiftPlan)) {
    for (const d of plan.days) for (const h of plan.hours) {
      await db.query("insert into public.shifts (runner_id, day_of_week, start_hour) values ($1,$2,$3) on conflict do nothing", [uid[k], d, h]);
    }
  }

  // ---------- orders ----------
  const windows: SurgeWindow[] = (await db.query<{ label: string; days: number[]; start_minute: number; end_minute: number; multiplier: number; active: boolean }>("select * from public.surge_windows")).map((w) => ({
    label: w.label, days: w.days.map(Number), startMinute: w.start_minute, endMinute: w.end_minute, multiplier: Number(w.multiplier), active: w.active,
  }));
  const spots = await db.query<{ id: string; name: string; lat: number; lng: number; type: string }>("select id, name, lat, lng, type from public.pickup_spots");
  const bRows = await db.query<{ id: string; lat: number; lng: number }>("select id, lat, lng from public.buildings");
  const customers = PEOPLE.filter((p) => p.role === "customer");
  const runnersFor = (bKey: string) => PEOPLE.filter((p) => p.role === "runner" && (rand() < 0.75 ? p.home === bKey : true));

  let codeN = 0;
  const code = () => {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    codeN++;
    let s = "";
    let n = codeN * 7919 + 104729;
    for (let i = 0; i < 5; i++) {
      s += alphabet[n % alphabet.length];
      n = Math.floor(n / alphabet.length) + 13;
    }
    return s;
  };

  // Evidence photos are stamped like the live camera would: captured time + one-time location result.
  const savePhoto = async (orderId: string | null, kind: "confirmation" | "pickup" | "door", by: string, at: Date) => {
    const bytes = kind === "confirmation" ? receiptPng() : kind === "pickup" ? bagPng() : doorPng();
    const path = `${by}/${kind}/${randomUUID()}.png`;
    await putObject("order-photos", path, bytes, "image/png");
    const evidence = kind !== "confirmation";
    const [r] = await db.query<{ id: string }>(
      `insert into public.photos (order_id, kind, bucket, path, uploaded_by, via_camera, captured_at, location_status, distance_m, created_at)
       values ($1, $2, 'order-photos', $3, $4, $5, $6, $7, $8, $6) returning id`,
      [orderId, kind, path, by, evidence, at.toISOString(), evidence ? "in_range" : null, evidence ? Math.round(6 + rand() * 30) : null],
    );
    return r.id;
  };

  /** Insert a row from a plain object (keeps long column lists readable). */
  const insert = async (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    const [r] = await db.query<{ id: string }>(
      `insert into public.${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      cols.map((c) => (row[c] instanceof Date ? (row[c] as Date).toISOString() : row[c])),
    );
    return r.id;
  };

  // Orders by the same runner within 25 minutes share a run.
  const lastRun: Record<string, { id: string; at: number }> = {};
  const runFor = async (runnerKey: string, at: Date, buildingId: string, closed: boolean) => {
    const prev = lastRun[runnerKey];
    if (prev && Math.abs(at.getTime() - prev.at) < 25 * 60000) return prev.id;
    const id = await insert("runs", { runner_id: uid[runnerKey], building_id: buildingId, heading_home: rand() < 0.4, created_at: at, closed_at: closed ? new Date(at.getTime() + 30 * 60000) : null });
    lastRun[runnerKey] = { id, at: at.getTime() };
    return id;
  };

  type Spec = {
    customer: Person;
    runner?: Person;
    status: "pending_payment" | "requested" | "claimed" | "picked_up" | "on_the_way" | "delivered" | "cancelled";
    createdAt: Date;
    tip: number;
    lateBy?: number; // minutes past ETA at delivery
    rating?: number;
    cancelledAfterClaim?: boolean;
    spotIdx?: number;
    foodCents?: number;
  };

  const create = async (s: Spec) => {
    const bId = bIds[s.customer.building];
    const b = bRows.find((x) => x.id === bId)!;
    const eligible = spots.filter((sp) => sp.type !== "dining_hall" && haversineMiles(sp, b) <= DEFAULT_PRICING.maxRadiusMiles);
    const sp = s.spotIdx !== undefined ? eligible[s.spotIdx % eligible.length] : pick(eligible);
    const dist = roundMiles(haversineMiles(sp, b));
    const surge = activeSurge(s.createdAt, windows, DEFAULT_PRICING);
    const runner = s.runner ?? (s.status === "requested" || s.status === "pending_payment" ? undefined : pick(runnersFor(s.customer.building)));
    const assigned = runner && !(s.status === "cancelled" && !s.cancelledAfterClaim) ? runner : undefined;
    const handoff = assigned ? (assigned.home === s.customer.building ? "door" : "lobby") : null;
    const foodValueCents = s.foodCents ?? 800 + Math.round(rand() * 38) * 100;
    const bags = rand() < 0.1 ? 2 : 1;
    // Lobby handoffs had the floor add-on refunded at claim; the seed simply never charges it.
    const q = quoteDelivery({ distanceMiles: dist, floor: s.customer.floor, tipCents: s.tip, surge, settings: DEFAULT_PRICING, foodValueCents, bags, lobby: handoff === "lobby" });
    if (isQuoteError(q)) return null;
    const t0 = s.createdAt.getTime();
    const claimedAt = assigned ? new Date(t0 + (2 + rand() * 6) * 60000) : null;
    const mins = estimateMinutes(dist, s.customer.floor);
    const eta = claimedAt ? new Date(claimedAt.getTime() + mins * 60000) : null;
    const pickedUp = claimedAt && ["picked_up", "on_the_way", "delivered"].includes(s.status) ? new Date(claimedAt.getTime() + mins * 0.45 * 60000) : null;
    const onWay = pickedUp && ["on_the_way", "delivered"].includes(s.status) ? new Date(pickedUp.getTime() + 60000) : null;
    const delivered = s.status === "delivered" && eta ? new Date(eta.getTime() + (s.lateBy ?? -(2 + rand() * 5)) * 60000) : null;
    const atDoor = delivered ? new Date(delivered.getTime() - (20 + rand() * 60) * 1000) : null;
    const lateRefund = delivered && eta && (delivered.getTime() - eta.getTime()) / 60000 > DEFAULT_PRICING.lateGraceMinutes;
    const cancelled = s.status === "cancelled" ? new Date(t0 + (s.cancelledAfterClaim ? 9 : 4) * 60000) : null;
    const capture = s.status === "pending_payment" ? null : `democap_seed${codeN}`;
    const refunded = lateRefund ? q.deliveryFeeCents : s.status === "cancelled" ? q.chargeCents - (s.cancelledAfterClaim ? DEFAULT_PRICING.cancelFeeCents : 0) : 0;
    const runId = assigned ? await runFor(assigned.key, claimedAt!, bId, !["claimed", "picked_up", "on_the_way"].includes(s.status)) : null;

    const orderCode = code();
    const id = await insert("orders", {
      code: orderCode,
      customer_id: uid[s.customer.key],
      runner_id: assigned ? uid[assigned.key] : null,
      run_id: runId,
      spot_id: sp.id,
      building_id: bId,
      floor: s.customer.floor,
      room: s.customer.room,
      pickup_name: s.customer.name.split(" ")[0] + " " + s.customer.name.split(" ")[1][0],
      order_number: String(1000 + Math.floor(rand() * 9000)),
      status: s.status,
      handoff,
      distance_miles: dist,
      base_fee_cents: q.baseFeeCents,
      distance_fee_cents: q.distanceFeeCents,
      floor_fee_cents: q.floorFeeCents,
      size_fee_cents: q.sizeFeeCents,
      bag_fee_cents: q.bagFeeCents,
      bags,
      surge_multiplier: q.surgeMultiplier,
      surge_fee_cents: q.surgeFeeCents,
      delivery_fee_cents: q.deliveryFeeCents,
      tip_cents: q.tipCents,
      guarantee_cents: q.guaranteeCents,
      total_cents: q.totalCents,
      credit_applied_cents: 0,
      charged_cents: q.chargeCents,
      food_value_cents: foodValueCents,
      platform_fee_cents: q.platformFeeCents,
      runner_fee_cents: q.runnerFeeCents,
      payment_provider: "demo",
      payment_ref: `demo_seed${codeN}`,
      capture_ref: capture,
      payment_status: s.status === "pending_payment" ? "pending" : refunded >= q.chargeCents ? "refunded" : refunded > 0 ? "partially_refunded" : "succeeded",
      refunded_cents: refunded,
      eta,
      claimed_at: assigned ? claimedAt : null,
      picked_up_at: pickedUp,
      on_the_way_at: onWay,
      heads_up_at: onWay,
      at_door_at: atDoor,
      door_location: atDoor ? "in_range" : null,
      door_distance_m: atDoor ? Math.round(5 + rand() * 25) : null,
      pin_entered_at: delivered,
      delivered_at: delivered,
      delivered_via: delivered ? "pin" : null,
      cancelled_at: cancelled,
      cancelled_by: cancelled ? "customer" : null,
      cancel_reason: cancelled ? (s.cancelledAfterClaim ? "Changed my mind" : "Ordered from the dining hall instead") : null,
      late_refunded_at: lateRefund ? delivered : null,
      created_at: s.createdAt,
      updated_at: s.createdAt,
    });
    const o = { id, code: orderCode };
    await db.query("insert into public.order_secrets (order_id, pin) values ($1, $2)", [o.id, String(Math.floor(rand() * 10000)).padStart(4, "0")]);
    const at = (d: Date | null) => (d ?? s.createdAt).toISOString();
    const ev = async (type: string, from: string | null, to: string | null, when: Date | null, actor: string | null = null, data: object = {}) =>
      db.query("insert into public.order_events (order_id, actor_id, type, from_status, to_status, data, created_at) values ($1,$2,$3,$4,$5,$6::jsonb,$7)", [o.id, actor, type, from, to, JSON.stringify(data), at(when)]);
    const ledger = (kind: string, amount: number, memo: string, when: Date, userId: string | null = null, ref: string | null = null) =>
      db.query("insert into public.ledger (order_id, user_id, kind, amount_cents, provider, provider_ref, memo, created_at) values ($1,$2,$3,$4,'demo',$5,$6,$7)", [o.id, userId, kind, amount, ref, memo, when.toISOString()]);

    await savePhoto(o.id, "confirmation", uid[s.customer.key], s.createdAt);
    await ev("created", null, "pending_payment", s.createdAt, uid[s.customer.key]);
    if (s.status === "pending_payment") return o;
    await ev("paid", "pending_payment", "requested", s.createdAt);
    await ledger("charge", q.chargeCents, `Delivery fee, tip and guarantee, order ${o.code}`, s.createdAt, uid[s.customer.key], capture);
    if (s.status !== "cancelled") await ledger("guarantee_in", q.guaranteeCents, `Delivery guarantee, order ${o.code}`, s.createdAt);
    if (claimedAt && assigned) await ev("claimed", "requested", "claimed", claimedAt, uid[assigned.key], { eta: eta!.toISOString(), handoff, runId });
    if (pickedUp && assigned) {
      await savePhoto(o.id, "pickup", uid[assigned.key], pickedUp);
      await ev("picked_up", "claimed", "picked_up", pickedUp, uid[assigned.key]);
    }
    if (onWay && assigned) {
      await ev("on_the_way", "picked_up", "on_the_way", onWay, uid[assigned.key]);
      await ev("heads_up", null, null, onWay, uid[assigned.key]);
    }
    if (delivered && assigned && atDoor) {
      const door = await savePhoto(o.id, "door", uid[assigned.key], atDoor);
      await db.query("update public.orders set door_photo_id = $2, countdown_ends_at = $3 where id = $1", [o.id, door, new Date(atDoor.getTime() + DEFAULT_PRICING.doorCountdownSeconds * 1000).toISOString()]);
      await ev("at_door", null, null, atDoor, uid[assigned.key], { location: "in_range" });
      await ev("pin_ok", null, null, delivered, uid[assigned.key]);
      await ev("delivered", "on_the_way", "delivered", delivered, uid[assigned.key], { via: "pin" });
      // Paid the moment the PIN is entered: one transfer per delivery, no hold.
      const earned = (lateRefund ? 0 : q.runnerFeeCents) + q.tipCents;
      let payoutId: string | null = null;
      if (earned > 0) {
        payoutId = await insert("payouts", { runner_id: uid[assigned.key], amount_cents: earned, status: "paid", provider: "demo", provider_ref: `tr_demo_${codeN}`, receiver: `acct_demo_${assigned.key}`, created_at: delivered, paid_at: delivered });
        await ledger("payout", -earned, "Runner payout", delivered, uid[assigned.key], `tr_demo_${codeN}`);
      }
      const line = (kind: string, amount: number) =>
        db.query("insert into public.runner_earnings (runner_id, order_id, kind, amount_cents, available_at, payout_id, created_at) values ($1,$2,$3,$4,$5,$6,$5)", [uid[assigned.key], o.id, kind, amount, delivered.toISOString(), payoutId]);
      if (lateRefund) {
        await ledger("refund", -q.deliveryFeeCents, `Late delivery refund, order ${o.code}`, delivered, uid[s.customer.key]);
        await ev("late_refund", null, null, delivered, null, { minutesLate: s.lateBy, refund: q.deliveryFeeCents });
        await db.query("insert into public.strikes (runner_id, reason, order_id, note, created_at) values ($1, 'late', $2, $3, $4)", [uid[assigned.key], o.id, `${s.lateBy} min past ETA`, delivered.toISOString()]);
      } else {
        await line("delivery_fee", q.runnerFeeCents);
        await ledger("platform_fee", q.platformFeeCents, `Platform fee, order ${o.code}`, delivered);
      }
      if (q.tipCents > 0) await line("tip", q.tipCents);
      if (s.rating) {
        const comments = ["", "", "Fast and friendly.", "Right on time with the PIN, thanks!", "Bag was perfect.", "A little slow but all good.", ""];
        await db.query("insert into public.ratings (order_id, customer_id, runner_id, stars, comment, created_at) values ($1,$2,$3,$4,$5,$6)", [o.id, uid[s.customer.key], uid[assigned.key], s.rating, pick(comments), delivered.toISOString()]);
      }
    }
    if (cancelled) {
      await ev("cancelled", s.cancelledAfterClaim ? "claimed" : "requested", "cancelled", cancelled, uid[s.customer.key], { by: "customer" });
      await ledger("refund", -refunded, `Cancelled, order ${o.code}`, cancelled, uid[s.customer.key]);
      if (s.cancelledAfterClaim && assigned) {
        const pid = await insert("payouts", { runner_id: uid[assigned.key], amount_cents: DEFAULT_PRICING.cancelFeeCents, status: "paid", provider: "demo", provider_ref: `tr_demo_c${codeN}`, receiver: `acct_demo_${assigned.key}`, created_at: cancelled, paid_at: cancelled });
        await db.query(
          "insert into public.runner_earnings (runner_id, order_id, kind, amount_cents, available_at, payout_id, memo, created_at) values ($1,$2,'cancellation_fee',$3,$4,$5,'Customer cancelled after claim',$4)",
          [uid[assigned.key], o.id, DEFAULT_PRICING.cancelFeeCents, cancelled.toISOString(), pid],
        );
      }
    }
    return o;
  };

  // History: ~4 weeks of delivered orders, heavier at night and on weekends.
  const now = new Date();
  let history = 0;
  for (let d = 28; d >= 1; d--) {
    const day = new Date(now.getTime() - d * 864e5);
    const p = nyParts(day);
    const weekend = p.weekday === 5 || p.weekday === 6;
    const n = Math.round((weekend ? 5 : 3) + rand() * 3 + (28 - d) / 7);
    for (let i = 0; i < n; i++) {
      const hour = pick([12, 13, 18, 19, 20, 21, 21, 22, 22, 22, 23, 23, 0, 1]);
      const created = fromNyWallClock(p.year, p.month, p.day, hour, Math.floor(rand() * 60));
      if (created.getTime() > now.getTime() - 3 * 3600000) continue;
      const late = rand() < 0.06 ? 18 + Math.floor(rand() * 10) : undefined;
      await create({
        customer: rand() < 0.55 ? pick(customers.slice(0, 3)) : pick(customers),
        status: rand() < 0.08 ? "cancelled" : "delivered",
        createdAt: created,
        tip: pick([0, 0, 50, 100, 100, 200, 150]),
        lateBy: late,
        rating: rand() < 0.7 ? (late ? pick([2, 3]) : pick([4, 5, 5, 5, 4, 3])) : undefined,
        cancelledAfterClaim: rand() < 0.3,
      });
      history++;
    }
  }
  await db.query("update public.runs set closed_at = coalesce(closed_at, created_at + interval '30 minutes')");

  // Older late strikes count as already reviewed by an admin: keep at most one active
  // per runner so seeded runners stay consistent with the 3-strike auto-suspension rule.
  await db.query(
    `update public.strikes set voided = true where id not in (
       select distinct on (runner_id) id from public.strikes order by runner_id, created_at desc)`,
  );

  // Live orders: one in every status. Maya (r1) is mid-run with two Tower orders.
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60000);
  const c = (k: string) => PEOPLE.find((p) => p.key === k)!;
  const r = (k: string) => PEOPLE.find((p) => p.key === k)!;
  delete lastRun.r1;
  await create({ customer: c("c5"), status: "pending_payment", createdAt: minsAgo(2), tip: 100, spotIdx: 1 });
  await create({ customer: c("c2"), status: "requested", createdAt: minsAgo(3), tip: 100, spotIdx: 0, foodCents: 1450 });
  await create({ customer: c("c4"), status: "requested", createdAt: minsAgo(6), tip: 50, spotIdx: 0, foodCents: 1890 });
  await create({ customer: c("c6"), status: "requested", createdAt: minsAgo(24), tip: 0, spotIdx: 3, foodCents: 2240 });
  await create({ customer: c("c3"), status: "requested", createdAt: minsAgo(4), tip: 200, spotIdx: 2, foodCents: 1275 });
  await create({ customer: c("c2"), runner: r("r1"), status: "picked_up", createdAt: minsAgo(14), tip: 50, spotIdx: 2, foodCents: 1625 });
  await create({ customer: c("c1"), runner: r("r1"), status: "on_the_way", createdAt: minsAgo(13), tip: 200, spotIdx: 2, foodCents: 2150 });
  await create({ customer: c("c3"), runner: r("r3"), status: "claimed", createdAt: minsAgo(5), tip: 100, spotIdx: 1, foodCents: 980 });
  delete lastRun.r2;
  const recent = await create({ customer: c("c1"), runner: r("r2"), status: "delivered", createdAt: minsAgo(3 * 60), tip: 100, spotIdx: 5, foodCents: 1740 });
  delete lastRun.r4;
  const older = await create({ customer: c("c3"), runner: r("r4"), status: "delivered", createdAt: minsAgo(30 * 60), tip: 0, spotIdx: 3, foodCents: 1320 });
  await create({ customer: c("c5"), status: "cancelled", createdAt: minsAgo(5 * 60), tip: 0 });

  // Cases: an open top-priority "gave my PIN, no food" and an auto-rejected theft claim.
  if (recent) {
    const [o] = await db.query<{ runner_id: string; pin_entered_at: Date }>("select runner_id, pin_entered_at from public.orders where id = $1", [recent.id]);
    const opened = new Date(new Date(o.pin_entered_at).getTime() + 2 * 60000);
    const caseId = await insert("cases", {
      order_id: recent.id, type: "pin_no_food", priority: 1, status: "open", customer_id: uid.c1, runner_id: o.runner_id, opened_by: uid.c1,
      reason: "pin_no_food", description: "I said my PIN at the door but the runner walked off with the bag. Someone else's name was on the receipt they showed me.",
      response_due_at: new Date(opened.getTime() + DEFAULT_PRICING.caseResponseHours * 3600000), refund_due_at: new Date(opened.getTime() + DEFAULT_PRICING.refundTargetHours * 3600000), created_at: opened,
    });
    for (const [user, role, other] of [[uid.c1, "customer", o.runner_id], [o.runner_id, "runner", uid.c1]] as const) {
      await insert("incidents", { user_id: user, role, type: "pin_no_food", order_id: recent.id, case_id: caseId, counterparty_id: other, pending: true, created_at: opened });
    }
    await insert("case_messages", { case_id: caseId, party: "customer", author_id: uid.admin, from_admin: true, body: "Thanks, we're looking at the door photo and PIN log now. Was anyone else in the hallway?", created_at: new Date(opened.getTime() + 20 * 60000) });
    await db.query("insert into public.order_events (order_id, actor_id, type, data, created_at) values ($1,$2,'case_opened',$3::jsonb,$4)", [recent.id, uid.c1, JSON.stringify({ type: "pin_no_food", caseId }), opened.toISOString()]);
  }
  if (older) {
    const [o] = await db.query<{ runner_id: string; delivered_at: Date }>("select runner_id, delivered_at from public.orders where id = $1", [older.id]);
    const opened = new Date(new Date(o.delivered_at).getTime() + 3 * 3600000);
    const caseId = await insert("cases", {
      order_id: older.id, type: "customer_claim", priority: 3, status: "resolved", customer_id: uid.c3, runner_id: o.runner_id, opened_by: uid.c3,
      reason: "never_received", description: "Never got my food.", auto_rejected: true, outcome: "rejected",
      outcome_note: "This order was completed with your PIN, which is proof of handoff. Theft or never-received claims on PIN-completed orders are automatically rejected.",
      refund_due_at: opened, resolved_at: opened, created_at: opened,
    });
    await insert("incidents", { user_id: uid.c3, role: "customer", type: "rejected_claim", order_id: older.id, case_id: caseId, counterparty_id: o.runner_id, created_at: opened });
  }

  // Zoe has credit from an earlier lost order, so the credit toggle shows up.
  await db.query("update public.profiles set credit_cents = 1250 where id = $1", [uid.c4]);
  await db.query("insert into public.ledger (user_id, kind, amount_cents, provider, memo, created_at) values ($1, 'credit_issued', 1250, 'demo', 'Food value as Dormdash credit (lost order)', now() - interval '6 days')", [uid.c4]);

  // A few notifications so the bell isn't empty.
  await db.query("insert into public.notifications (user_id, category, title, body, url, created_at) values ($1,'order_updates','Maya has your order','ETA in a few minutes. Be at your door with your PIN.','/orders', now() - interval '12 minutes')", [uid.c1]);
  await db.query("insert into public.notifications (user_id, category, title, body, url, created_at) values ($1,'account','New runner application','Leo Park applied to run.','/admin/runners', now() - interval '2 hours')", [uid.admin]);

  console.log(`Seeded ${PEOPLE.length} users, ${history} historical orders, live orders in every status, 2 cases.`);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await (await getDb()).close();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
