import postgres from "postgres";
import type { Db, Queryable } from "./types";

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  };
}

export function createPostgresDb(url: string): Db {
  // prepare:false keeps us compatible with Supabase's transaction pooler (port 6543).
  const sql = postgres(url, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idle_timeout: 20,
    transform: { undefined: null },
    // Return int8 as a JS number (our counts and ids are small) to match PGlite.
    types: {
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      // Callers pass JSON already stringified (`$1::jsonb` with JSON.stringify(v)), which
      // PGlite accepts as-is. postgres.js would stringify it again into a JSON *string*,
      // so leave strings alone here and only encode real objects.
      json: { to: 114, from: [114], serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)), parse: (x: string) => JSON.parse(x) },
      jsonb: { to: 3802, from: [3802], serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)), parse: (x: string) => JSON.parse(x) },
    },
  });
  return {
    ...wrap(sql),
    tx: (fn) => sql.begin((t) => fn(wrap(t))) as never,
    exec: async (text) => {
      // Migrations contain many statements: that needs the simple query protocol.
      await sql.unsafe(text).simple();
    },
    close: () => sql.end(),
  };
}
