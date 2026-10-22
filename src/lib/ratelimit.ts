import "server-only";
import { q, q1 } from "@/lib/db";
import { ApiError } from "@/lib/http";

/**
 * Fixed-window counter stored in Postgres (works across serverless instances).
 * Returns the count in the current window, after incrementing.
 */
export async function hit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: Date }> {
  const row = await q1<{ count: number; window_start: Date }>(
    `insert into public.rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count, window_start`,
    [key, windowSeconds],
  );
  return { count: row!.count, resetAt: new Date(new Date(row!.window_start).getTime() + windowSeconds * 1000) };
}

export async function peek(key: string, windowSeconds: number): Promise<{ count: number; resetAt: Date } | null> {
  const row = await q1<{ count: number; window_start: Date }>(
    "select count, window_start from public.rate_limits where key = $1 and window_start >= now() - make_interval(secs => $2)",
    [key, windowSeconds],
  );
  return row ? { count: row.count, resetAt: new Date(new Date(row.window_start).getTime() + windowSeconds * 1000) } : null;
}

export async function resetLimit(key: string) {
  await q("delete from public.rate_limits where key = $1", [key]);
}

/** Throw 429 with a human message once `max` hits are exceeded in the window. */
export async function limit(key: string, max: number, windowSeconds: number, what = "that") {
  const { count, resetAt } = await hit(key, windowSeconds);
  if (count > max) {
    const mins = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60000));
    throw new ApiError(429, "rate_limited", `Slow down a sec. You've done ${what} a lot. Try again in ${mins} min.`);
  }
}

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_SECONDS = 15 * 60;
