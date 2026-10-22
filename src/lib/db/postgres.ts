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
    },
  });
  return {
    ...wrap(sql),
    tx: (fn) => sql.begin((t) => fn(wrap(t))) as never,
    exec: async (text) => {
      await sql.unsafe(text);
    },
    close: () => sql.end(),
  };
}
