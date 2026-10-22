import "server-only";
import type { Queryable } from "@/lib/db";
import { counterpartyPattern, noShowRateFlag, noShowStrikeLevel } from "@/lib/domain/patterns";
import type { PricingSettings } from "@/lib/domain/pricing";
import { notify, notifyAdmins } from "@/lib/notify";

export type IncidentType =
  | "no_show"
  | "runner_not_at_door"
  | "pin_no_food"
  | "missing_delivery"
  | "problem_report"
  | "rejected_claim"
  | "theft";

type After = () => Promise<unknown>;

/** Record an incident and re-check the abuse patterns for that person. */
export async function recordIncident(
  t: Queryable,
  i: { userId: string; role: "customer" | "runner"; type: IncidentType; orderId?: string | null; caseId?: string | null; counterpartyId?: string | null; pending?: boolean },
  s: PricingSettings,
): Promise<After[]> {
  await t.query(
    "insert into public.incidents (user_id, role, type, order_id, case_id, counterparty_id, pending) values ($1,$2,$3,$4,$5,$6,$7)",
    [i.userId, i.role, i.type, i.orderId ?? null, i.caseId ?? null, i.counterpartyId ?? null, !!i.pending],
  );
  return evaluatePatterns(t, i.userId, i.role, s);
}

async function flag(t: Queryable, userId: string, reason: string): Promise<After[]> {
  const [p] = await t.query<{ flagged_at: Date | null }>("select flagged_at from public.profiles where id = $1", [userId]);
  if (p?.flagged_at) return [];
  await t.query("update public.profiles set flagged_at = now(), flag_reason = $2, on_shift = false where id = $1", [userId, reason]);
  return [
    () => notify(userId, { category: "account", title: "Your account is under review", body: "Ordering and running are paused until a Dormdash admin takes a look. We'll email you.", url: "/profile" }),
    () => notifyAdmins({ title: "Account auto-flagged", body: reason, url: `/admin/users/${userId}` }),
  ];
}

/**
 * Pattern auto-flags:
 * - incidents/claims involving 3+ different counterparties in 60 days (customers or runners)
 * - a runner whose "Customer not here" rate is over 20% of their last 10+ finished orders
 * - customer no-shows: 2 in 30 days = warning, 3+ = admin review before ordering again
 */
export async function evaluatePatterns(t: Queryable, userId: string, role: "customer" | "runner", s: PricingSettings): Promise<After[]> {
  const after: After[] = [];
  const now = new Date();
  const incidents = await t.query<{ counterparty_id: string | null; created_at: Date; type: string }>(
    "select counterparty_id, created_at, type from public.incidents where user_id = $1 and role = $2 and not voided and created_at > now() - make_interval(days => $3)",
    [userId, role, Math.max(s.patternWindowDays, s.noShowWindowDays)],
  );
  const pattern = counterpartyPattern(
    incidents.map((i) => ({ counterpartyId: i.counterparty_id, createdAt: new Date(i.created_at) })),
    now,
    s.patternWindowDays,
    s.patternCounterparties,
  );
  if (pattern.flagged) {
    after.push(...(await flag(t, userId, `${role === "customer" ? "Customer" : "Runner"} with incidents involving ${pattern.count} different ${role === "customer" ? "runners" : "customers"} in ${s.patternWindowDays} days`)));
  }

  if (role === "runner") {
    const last = await t.query<{ status: string }>(
      `select status from public.orders where runner_id = $1 and status in ('delivered','customer_no_show')
       order by coalesce(no_show_at, delivered_at) desc limit 20`,
      [userId],
    );
    const rate = noShowRateFlag(last, s.noShowRateMinOrders, s.noShowRatePct);
    if (rate.flagged) after.push(...(await flag(t, userId, `"Customer not here" on ${Math.round(rate.pct)}% of last ${last.length} orders`)));
  }

  if (role === "customer") {
    const since = now.getTime() - s.noShowWindowDays * 86400000;
    const noShows = incidents.filter((i) => i.type === "no_show" && new Date(i.created_at).getTime() >= since).length;
    const lvl = noShowStrikeLevel(noShows, s.noShowWarnCount, s.noShowReviewCount);
    if (lvl === "review") {
      await t.query("update public.profiles set customer_review_required = true where id = $1", [userId]);
      after.push(
        () => notify(userId, { category: "account", title: "Ordering is paused", body: `That's ${noShows} missed handoffs in ${s.noShowWindowDays} days. An admin will review your account before you can order again.`, url: "/profile" }),
        () => notifyAdmins({ title: "Customer needs review", body: `${noShows} no-shows in ${s.noShowWindowDays} days.`, url: `/admin/users/${userId}` }),
      );
    } else if (lvl === "warning") {
      after.push(() =>
        notify(userId, { category: "account", title: "Heads up: missed handoffs", body: `You've missed ${noShows} handoffs in ${s.noShowWindowDays} days. One more and ordering pauses for review.`, url: "/profile" }),
      );
    }
  }
  return after;
}
