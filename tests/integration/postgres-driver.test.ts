import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createPostgresDb } from "@/lib/db/postgres";
import { migrate, type Db } from "@/lib/db";

// Production talks to Supabase through postgres.js over the wire protocol. This runs
// that exact driver against a Postgres wire server (PGlite behind a socket), so the
// production code path (migrations, parameter types, role switching) is tested too.
const PORT = 55432;
let pg: PGlite;
let server: PGLiteSocketServer;
let db: Db;

beforeAll(async () => {
  pg = new PGlite();
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
  await server.start();
  db = createPostgresDb(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`);
  // On Supabase the auth schema already exists; stand it up here first.
  await db.exec(readFileSync("scripts/local-bootstrap.sql", "utf8"));
});

afterAll(async () => {
  await db?.close();
  await server?.stop();
  await pg?.close();
});

describe("postgres.js driver (production path)", () => {
  it("applies every migration with multi-statement SQL, and is idempotent", async () => {
    const applied = await migrate(db, { local: false });
    expect(applied).toEqual(["0001_schema.sql", "0002_rls.sql", "0003_defaults.sql", "0004_runner_stats.sql", "0005_enum_values.sql", "0006_runs_handoff_cases.sql"]);
    expect(await migrate(db, { local: false })).toEqual([]);
  });

  it("returns counts as numbers, timestamps as Dates, jsonb as objects", async () => {
    const [r] = await db.query<{ n: number; t: Date; j: { a: number }; arr: number[] }>(
      "select count(*) as n, now() as t, $1::jsonb as j, (select tip_presets from public.pricing_settings) as arr",
      [JSON.stringify({ a: 1 })],
    );
    expect(typeof r.n).toBe("number");
    expect(r.t).toBeInstanceOf(Date);
    expect(r.j).toEqual({ a: 1 });
    expect(r.arr.map(Number)).toEqual([0, 50, 100, 200]);
    // Stringified JSON params must land as real objects/arrays, not JSON strings.
    const [t] = await db.query<{ o: string; a: string; n: number }>(
      "select jsonb_typeof($1::jsonb) as o, jsonb_typeof($2::jsonb) as a, (select count(*) from jsonb_array_elements_text($2::jsonb))::int as n",
      [JSON.stringify({ via: "pin" }), JSON.stringify([0, 50, 100])],
    );
    expect(t).toEqual({ o: "object", a: "array", n: 3 });
  });

  it("enforces RLS when a transaction switches to the authenticated role", async () => {
    const [b] = await db.query<{ id: string }>("insert into public.buildings (name, short_name, address, lat, lng, floor_count) values ('T','T','x',40.7,-73.9,10) returning id");
    const mk = async (email: string) =>
      (await db.query<{ id: string }>("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, 'x', $2::jsonb) returning id", [email, JSON.stringify({ full_name: email, building_id: b.id, floor: "3", room: "1" })]))[0].id;
    const alice = await mk("a@nyu.edu");
    const bob = await mk("b@nyu.edu");
    const visible = await db.tx(async (t) => {
      await t.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      await t.query("set local role authenticated");
      return t.query<{ id: string }>("select id from public.profiles");
    });
    expect(visible).toEqual([{ id: alice }]);
    expect(visible.map((v) => v.id)).not.toContain(bob);
    // The role switch was local to the transaction.
    const all = await db.query("select id from public.profiles");
    expect(all).toHaveLength(2);
  });
});
