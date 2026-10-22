import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb } from "@/lib/db/pglite";
import { migrate, type Db } from "@/lib/db";

// Upgrading a database created before cases existed: 0006 replaces disputes with cases
// and renames photos.dispute_id to case_id. A dispute with a photo used to make the
// new photos_case_id_fkey fail, which stopped the local database from opening at all.
const DIR = path.join(process.cwd(), "supabase", "migrations");
const BEFORE_CASES = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f < "0006").sort();

let db: Db;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = createPgliteDb();
  await db.exec(readFileSync(path.join(process.cwd(), "scripts", "local-bootstrap.sql"), "utf8"));
  for (const f of BEFORE_CASES) {
    await db.exec(readFileSync(path.join(DIR, f), "utf8"));
    await db.query("insert into local.migrations(name) values ($1)", [f]);
  }
  const one = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params))[0].id;
  ids.building = await one("insert into public.buildings (name, short_name, address, lat, lng, floor_count) values ('Tower Hall','Tower','x',40.73,-73.99,16) returning id");
  ids.spot = await one("insert into public.pickup_spots (name, address, lat, lng, type) values ('Corner Store','x',40.73,-73.99,'convenience') returning id");
  for (const who of ["customer", "runner"]) {
    ids[who] = await one("insert into auth.users (email, encrypted_password) values ($1, 'x') returning id", [`${who}@nyu.edu`]);
    await db.query("insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [ids[who], `${who}@nyu.edu`, who]);
  }
  ids.order = await one(
    `insert into public.orders (code, customer_id, runner_id, spot_id, building_id, floor, room, pickup_name, distance_miles,
       base_fee_cents, distance_fee_cents, floor_fee_cents, delivery_fee_cents, total_cents, platform_fee_cents, runner_fee_cents, payment_provider, status)
     values ('DD-OLD1', $1, $2, $3, $4, 14, '1412', 'Jo', 0.1, 199, 0, 70, 269, 269, 67, 202, 'demo', 'delivered') returning id`,
    [ids.customer, ids.runner, ids.spot, ids.building],
  );
  ids.openDispute = await one(
    "insert into public.disputes (order_id, customer_id, runner_id, reason, description, status) values ($1, $2, $3, 'missing', 'Never came up.', 'runner_responded') returning id",
    [ids.order, ids.customer, ids.runner],
  );
  ids.photo = await one("insert into public.photos (dispute_id, kind, bucket, path, uploaded_by) values ($1, 'dispute', 'order-photos', 'x/1.jpg', $2) returning id", [
    ids.openDispute,
    ids.customer,
  ]);
});

afterAll(() => db.close());

describe("upgrading a database that has disputes with photos", () => {
  it("applies the cases migration without a photos_case_id_fkey violation", async () => {
    const applied = await migrate(db, { local: true });
    expect(applied[0]).toBe("0006_runs_handoff_cases.sql");
  });

  it("keeps each dispute as a case with the same id, so its photos stay linked", async () => {
    const [c] = await db.query<{ type: string; status: string; reason: string; description: string }>("select type, status, reason, description from public.cases where id = $1", [ids.openDispute]);
    expect(c).toEqual({ type: "customer_claim", status: "under_review", reason: "missing", description: "Never came up." });
    const [p] = await db.query<{ case_id: string }>("select case_id from public.photos where id = $1", [ids.photo]);
    expect(p.case_id).toBe(ids.openDispute);
  });
});
