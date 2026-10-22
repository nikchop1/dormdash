import "server-only";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { dbMode, env } from "@/lib/env";
import type { Db, Queryable, Row } from "./types";

export type { Db, Queryable, Row };

declare global {
  var __floordropDb: Promise<Db> | undefined;
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const BOOTSTRAP = path.join(process.cwd(), "scripts", "local-bootstrap.sql");

/** Apply local bootstrap (PGlite only) and any migrations not yet recorded. */
export async function migrate(db: Db, opts: { local: boolean }) {
  if (opts.local) {
    await db.exec(readFileSync(BOOTSTRAP, "utf8"));
  } else {
    await db.exec(`create schema if not exists local;
      create table if not exists local.migrations (name text primary key, applied_at timestamptz not null default now());`);
  }
  const done = new Set((await db.query<{ name: string }>("select name from local.migrations")).map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    await db.query("insert into local.migrations(name) values ($1)", [f]);
    applied.push(f);
  }
  return applied;
}

async function open(): Promise<Db> {
  if (dbMode === "postgres") {
    const { createPostgresDb } = await import("./postgres");
    return createPostgresDb(env.databaseUrl);
  }
  const { createPgliteDb } = await import("./pglite");
  const dir = path.resolve(env.pgliteDir);
  mkdirSync(dir, { recursive: true });
  const db = createPgliteDb(dir);
  // Local database migrates itself on first use, so `npm run dev` just works.
  await migrate(db, { local: true });
  return db;
}

/** Privileged connection. Bypasses RLS: callers must check permissions themselves. */
export function getDb(): Promise<Db> {
  if (!globalThis.__floordropDb) {
    globalThis.__floordropDb = open().catch((e) => {
      globalThis.__floordropDb = undefined;
      throw e;
    });
  }
  return globalThis.__floordropDb;
}

/** Test hook: point the app at a specific database instance. */
export function setDbForTests(db: Db) {
  globalThis.__floordropDb = Promise.resolve(db);
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await getDb()).query<T>(text, params);
}

export async function q1<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  return (await getDb()).tx(fn);
}

/**
 * Run queries as a specific signed-in user, exactly like Supabase's Data API does:
 * switch to the `authenticated` role and set the JWT claims, so RLS policies apply.
 * Use this for user-scoped reads; it is a second line of defense behind route checks.
 */
export async function asUser<T>(userId: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return tx(async (t) => {
    await t.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await t.query("set local role authenticated");
    return fn(t);
  });
}

/** Serialize a JS array for use as `$n::jsonb` (portable across both drivers). */
export const json = (v: unknown) => JSON.stringify(v);
