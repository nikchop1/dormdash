export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Run fn inside a transaction on a single connection. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run multi-statement SQL (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
