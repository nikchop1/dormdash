import { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable } from "./types";

function wrap(pg: { query: PGlite["query"] }): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params as never[]);
      return res.rows;
    },
  };
}

export function createPgliteDb(dataDir?: string): Db {
  const pg = new PGlite(dataDir);
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t as unknown as PGlite))),
    exec: async (sql) => {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
}
