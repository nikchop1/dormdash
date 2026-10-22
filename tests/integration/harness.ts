import { createPgliteDb } from "@/lib/db/pglite";
import { migrate, setDbForTests, type Db } from "@/lib/db";
import { localAuth } from "@/lib/auth/local";
import { recomputeDistances } from "@/lib/services/places";
import { switchBrowser } from "./setup";

export const PASSWORD = "Elevator14";

/** Fresh in-memory Postgres with the real migrations + RLS, wired into the app. */
export async function freshDb(): Promise<Db> {
  const db = createPgliteDb();
  await migrate(db, { local: true });
  setDbForTests(db);
  return db;
}

export async function fixtures(db: Db) {
  const [tower] = await db.query<{ id: string }>(
    "insert into public.buildings (name, short_name, address, lat, lng, floor_count) values ('Tower Hall','Tower','test',40.7339,-73.9962,16) returning id",
  );
  const [mercer] = await db.query<{ id: string }>(
    "insert into public.buildings (name, short_name, address, lat, lng, floor_count) values ('Mercer House','Mercer','test',40.7287,-73.9967,8) returning id",
  );
  const [near] = await db.query<{ id: string }>(
    "insert into public.pickup_spots (name, address, lat, lng, type) values ('Corner Store','test',40.7323,-73.9967,'convenience') returning id",
  );
  const [far] = await db.query<{ id: string }>(
    "insert into public.pickup_spots (name, address, lat, lng, type) values ('Far Diner','test',40.7420,-73.9900,'restaurant') returning id",
  );
  const [hall] = await db.query<{ id: string }>(
    "insert into public.pickup_spots (name, address, lat, lng, type) values ('Dining Hall','test',40.7331,-73.9960,'dining_hall') returning id",
  );
  await recomputeDistances(db);
  return { tower: tower.id, mercer: mercer.id, near: near.id, far: far.id, hall: hall.id };
}

let phoneN = 100;
export async function makeUser(
  db: Db,
  email: string,
  opts: { building: string; floor?: number; runner?: "approved" | "pending" | "suspended"; home?: string; onShift?: boolean; admin?: boolean; payoutEmail?: string } ,
) {
  const id = await localAuth.createConfirmedUser({
    email,
    password: PASSWORD,
    metadata: { full_name: email.split("@")[0].replace(/\d/g, "") + " Tester", phone: `+1212555${String(phoneN++).padStart(4, "0")}`, building_id: opts.building, floor: String(opts.floor ?? 9), room: "901", terms_accepted: "true" },
  });
  await db.query(
    "update public.profiles set runner_status = $2, runner_home_building_id = $3, on_shift = $4, is_admin = $5, payout_email = $6 where id = $1",
    [id, opts.runner ?? "none", opts.home ?? null, !!opts.onShift, !!opts.admin, opts.payoutEmail ?? (opts.runner ? email : null)],
  );
  return id;
}

/** Call a route handler like Next would. */
export async function call<T = Record<string, unknown>>(
  handler: (req: Request, ctx: never) => Promise<Response>,
  opts: { method?: string; url?: string; body?: unknown; params?: Record<string, string>; form?: FormData } = {},
): Promise<{ status: number; body: T }> {
  const init: RequestInit = { method: opts.method ?? "POST", headers: { "x-forwarded-for": "10.0.0.1" } };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { ...init.headers, "Content-Type": "application/json" };
  }
  const res = await handler(new Request(opts.url ?? "http://localhost:3000/api/test", init), { params: Promise.resolve(opts.params ?? {}) } as never);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON (csv/redirect) */
  }
  return { status: res.status, body: body as T };
}

/** Log a browser in through the real login route. */
export async function loginAs(browser: string, email: string, password = PASSWORD) {
  switchBrowser(browser);
  const { POST } = await import("@/app/api/auth/login/route");
  const r = await call(POST, { body: { email, password } });
  if (r.status !== 200 || (r.body as { ok?: boolean }).ok !== true) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
}

export async function photo(db: Db, userId: string, kind: string) {
  const [p] = await db.query<{ id: string }>(
    "insert into public.photos (kind, bucket, path, uploaded_by) values ($1, 'order-photos', $2, $3) returning id",
    [kind, `${userId}/${kind}/${Math.random().toString(36).slice(2)}.png`, userId],
  );
  return p.id;
}

export function tinyPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  );
}
