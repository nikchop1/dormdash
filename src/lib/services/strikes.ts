import "server-only";
import type { Queryable } from "@/lib/db";
import { shouldSuspend, type StrikeReason } from "@/lib/domain/runners";
import { notify, notifyAdmins } from "@/lib/notify";

const REASON_COPY: Record<StrikeReason, string> = {
  late: "a late delivery",
  dispute: "an upheld problem report",
  unclaim: "dropping jobs after claiming them",
  manual: "an admin review",
};

/**
 * Add a strike and auto-suspend the runner at the threshold.
 * Notifications are returned as a callback so callers can send them after commit.
 */
export async function addStrike(
  t: Queryable,
  s: { runnerId: string; reason: StrikeReason; orderId?: string | null; note?: string; by?: string | null; threshold: number },
): Promise<{ active: number; suspended: boolean; after: () => Promise<void> }> {
  await t.query(
    "insert into public.strikes (runner_id, reason, order_id, note, created_by) values ($1, $2, $3, $4, $5)",
    [s.runnerId, s.reason, s.orderId ?? null, s.note ?? "", s.by ?? null],
  );
  const [{ n }] = await t.query<{ n: number }>("select count(*)::int as n from public.strikes where runner_id = $1 and not voided", [s.runnerId]);
  const suspend = shouldSuspend(n, s.threshold);
  if (suspend) {
    await t.query(
      "update public.profiles set runner_status = 'suspended', on_shift = false, on_shift_since = null where id = $1 and runner_status = 'approved'",
      [s.runnerId],
    );
  }
  return {
    active: n,
    suspended: suspend,
    after: async () => {
      await notify(s.runnerId, {
        category: "account",
        title: suspend ? "Runner account paused" : `Strike ${n} of ${s.threshold}`,
        body: suspend
          ? `You've hit ${n} strikes, so running is paused until an admin reviews it. Most recent: ${REASON_COPY[s.reason]}.`
          : `You got a strike for ${REASON_COPY[s.reason]}. At ${s.threshold}, running pauses for review.`,
        url: "/run/earnings",
      });
      if (suspend) {
        await notifyAdmins({ title: "Runner auto-suspended", body: `A runner hit ${n} strikes and needs review.`, url: `/admin/users/${s.runnerId}` });
      }
    },
  };
}
