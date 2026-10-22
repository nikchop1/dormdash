import "server-only";
import { dbMode, env } from "@/lib/env";
import { q } from "@/lib/db";

/** Dev tools (outbox) exist only on the local database, and never on a real deploy unless forced. */
export const devToolsEnabled = () => dbMode === "pglite" && (!env.isProd || env.devTools);

export async function outbox(to?: string) {
  return q<{ id: number; to_email: string; subject: string; text: string; html: string; created_at: Date }>(
    `select * from local.outbox ${to ? "where lower(to_email) = lower($1)" : ""} order by id desc limit 50`,
    to ? [to] : [],
  );
}

export function firstLink(text: string): string | null {
  return text.match(/https?:\/\/\S+/)?.[0] ?? null;
}
