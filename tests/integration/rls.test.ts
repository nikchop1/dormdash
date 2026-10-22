import { beforeAll, describe, expect, it } from "vitest";
import { asUser, type Db } from "@/lib/db";
import { call, fixtures, freshDb, loginAs, makeUser, photo } from "./harness";
import { createOrder } from "@/lib/services/orders";
import { loadProfile } from "@/lib/auth/session";
import { GET as orderVersion } from "@/app/api/orders/[id]/route";
import { GET as boardVersion } from "@/app/api/runner/jobs/route";
import { POST as claim } from "@/app/api/runner/claim/route";
import { POST as decide } from "@/app/api/admin/applications/[id]/route";
import { GET as exportCsv } from "@/app/api/admin/export/route";
import { PUT as pricing } from "@/app/api/admin/pricing/route";
import { PATCH as notifPrefs } from "@/app/api/profile/notifications/route";

let db: Db;
let ids: Record<string, string>;
let orderA: string;
let orderB: string;

beforeAll(async () => {
  db = await freshDb();
  const f = await fixtures(db);
  ids = {
    tower: f.tower,
    near: f.near,
    alice: await makeUser(db, "alice@nyu.edu", { building: f.tower }),
    bob: await makeUser(db, "bob@nyu.edu", { building: f.tower }),
    runOn: await makeUser(db, "runon@nyu.edu", { building: f.tower, runner: "approved", home: f.tower, onShift: true }),
    runOff: await makeUser(db, "runoff@nyu.edu", { building: f.tower, runner: "approved", home: f.tower, onShift: false }),
    admin: await makeUser(db, "admin@nyu.edu", { building: f.tower, admin: true }),
  };
  const mk = async (who: string) => {
    const user = { id: ids[who], email: `${who}@nyu.edu`, emailVerified: true, profile: (await loadProfile(ids[who]))!, isAdmin: false, isRunner: false };
    return (await createOrder(user, {
      spotId: f.near, pickupName: who, orderNumber: "", buildingId: f.tower, floor: 9, room: "901", notes: "", tipCents: 100, scheduledFor: null,
      confirmationPhotoId: await photo(db, ids[who], "confirmation"),
    })).orderId;
  };
  orderA = await mk("alice");
  orderB = await mk("bob");
});

const visible = (userId: string, sql: string, params: unknown[] = []) => asUser(userId, (t) => t.query(sql, params));

describe("row level security (as the database sees it)", () => {
  it("customers see only their own orders", async () => {
    const rows = await visible(ids.alice, "select id from public.orders");
    expect(rows.map((r) => r.id)).toEqual([orderA]);
  });

  it("customers can read their own PIN but runners never can", async () => {
    expect(await visible(ids.alice, "select pin from public.order_secrets where order_id = $1", [orderA])).toHaveLength(1);
    expect(await visible(ids.alice, "select pin from public.order_secrets where order_id = $1", [orderB])).toHaveLength(0);
    expect(await visible(ids.runOn, "select pin from public.order_secrets")).toHaveLength(0);
  });

  it("open jobs are visible only to approved runners who are on shift", async () => {
    expect(await visible(ids.runOn, "select id from public.orders where status = 'requested'")).toHaveLength(2);
    expect(await visible(ids.runOff, "select id from public.orders where status = 'requested'")).toHaveLength(0);
  });

  it("admins see everything", async () => {
    expect(await visible(ids.admin, "select id from public.orders")).toHaveLength(2);
    expect(await visible(ids.admin, "select pin from public.order_secrets")).toHaveLength(2);
  });

  it("users can't read other people's profiles or notifications", async () => {
    expect(await visible(ids.alice, "select id from public.profiles")).toEqual([{ id: ids.alice }]);
    await db.query("insert into public.notifications (user_id, category, title) values ($1, 'account', 'secret')", [ids.bob]);
    expect(await visible(ids.alice, "select id from public.notifications")).toHaveLength(0);
  });

  it("users can't escalate themselves to admin or runner", async () => {
    await expect(visible(ids.alice, "update public.profiles set is_admin = true where id = $1", [ids.alice])).rejects.toThrow(/permission denied/);
    await expect(visible(ids.alice, "update public.profiles set runner_status = 'approved' where id = $1", [ids.alice])).rejects.toThrow(/permission denied/);
    // ...but can edit their own name.
    await visible(ids.alice, "update public.profiles set full_name = 'Alice Q' where id = $1", [ids.alice]);
    const [p] = await db.query<{ full_name: string; is_admin: boolean }>("select full_name, is_admin from public.profiles where id = $1", [ids.alice]);
    expect(p).toEqual({ full_name: "Alice Q", is_admin: false });
  });

  it("users can't write orders or the ledger directly", async () => {
    await expect(visible(ids.alice, "update public.orders set total_cents = 0 where id = $1", [orderA])).rejects.toThrow(/permission denied/);
    await expect(visible(ids.alice, "insert into public.ledger (kind, amount_cents, provider) values ('refund', 100, 'demo')")).rejects.toThrow(/permission denied/);
  });

  it("server-only tables are closed to signed-in users", async () => {
    await expect(visible(ids.admin, "select * from public.rate_limits")).rejects.toThrow(/permission denied/);
  });
});

describe("RLS-sensitive API routes", () => {
  it("order status endpoint returns 404 for someone else's order", async () => {
    await loginAs("alice", "alice@nyu.edu");
    expect((await call(orderVersion, { method: "GET", params: { id: orderA } })).status).toBe(200);
    expect((await call(orderVersion, { method: "GET", params: { id: orderB } })).status).toBe(404);
  });

  it("job board endpoint shows nothing to off-shift runners", async () => {
    await loginAs("runoff", "runoff@nyu.edu");
    const off = await call<{ count: number }>(boardVersion, { method: "GET" });
    expect(off.body.count).toBe(0);
    await loginAs("runon", "runon@nyu.edu");
    const on = await call<{ count: number }>(boardVersion, { method: "GET" });
    expect(on.body.count).toBe(2);
  });

  it("notification preferences can only change your own row", async () => {
    await loginAs("alice2", "alice@nyu.edu");
    const body = { push_order_updates: false, push_new_jobs: false, push_disputes: false, push_account: false, email_order_updates: true, email_disputes: true, email_account: true };
    expect((await call(notifPrefs, { method: "PATCH", body })).status).toBe(200);
    const rows = await db.query<{ user_id: string; push_order_updates: boolean }>("select user_id, push_order_updates from public.notification_preferences");
    expect(rows.find((r) => r.user_id === ids.alice)?.push_order_updates).toBe(false);
    expect(rows.filter((r) => r.user_id !== ids.alice).every((r) => r.push_order_updates)).toBe(true);
  });
});

describe("role protection", () => {
  it("customers can't claim jobs", async () => {
    await loginAs("alice3", "alice@nyu.edu");
    const r = await call(claim, { body: { orderIds: [orderB] } });
    expect(r.status).toBe(403);
  });

  it("off-shift runners can't claim", async () => {
    await loginAs("runoff2", "runoff@nyu.edu");
    const r = await call(claim, { body: { orderIds: [orderB] } });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toMatch(/Go on shift/);
  });

  it("non-admins get 403 from admin APIs; signed-out users get 401", async () => {
    await loginAs("runon2", "runon@nyu.edu");
    expect((await call(decide, { body: { approve: true }, params: { id: ids.alice } })).status).toBe(403);
    expect((await call(exportCsv, { method: "GET", url: "http://localhost/api/admin/export?report=summary" })).status).toBe(403);
    expect((await call(pricing, { method: "PUT", body: {} })).status).toBe(403);
    const { switchBrowser } = await import("./setup");
    switchBrowser("anonymous");
    expect((await call(exportCsv, { method: "GET", url: "http://localhost/api/admin/export?report=summary" })).status).toBe(401);
  });

  it("admins can export KPI CSVs", async () => {
    await loginAs("admin", "admin@nyu.edu");
    const r = await call<string>(exportCsv, { method: "GET", url: "http://localhost/api/admin/export?report=summary&days=30" });
    expect(r.status).toBe(200);
    expect(r.body).toContain("metric,value");
    expect(r.body).toContain("orders,");
  });
});
