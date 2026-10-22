import "server-only";
import { randomUUID } from "node:crypto";
import { q, tx } from "@/lib/db";
import { getPayments } from "@/lib/payments";
import { getPricing } from "@/lib/settings";
import { notify } from "@/lib/notify";

/**
 * Pay every runner their available balance (earnings past the dispute hold that
 * aren't in a payout yet). Negative lines (clawbacks) net against positives. Runs
 * daily from cron. In demo mode payouts are marked paid instantly.
 */
export async function runPayouts() {
  const settings = await getPricing();
  const provider = getPayments();
  const balances = await q<{ runner_id: string; amount: number; receiver: string | null }>(
    `select e.runner_id, sum(e.amount_cents)::int as amount, p.payout_email as receiver
     from public.runner_earnings e join public.profiles p on p.id = e.runner_id
     where e.payout_id is null and e.available_at <= now()
     group by e.runner_id, p.payout_email
     having sum(e.amount_cents) >= $1`,
    [settings.minPayoutCents],
  );
  const batchId = `fd-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const items: { payoutId: string; receiver: string; amountCents: number; runnerId: string }[] = [];

  for (const b of balances) {
    if (provider.mode === "paypal" && !b.receiver) continue; // runner hasn't added a PayPal email yet
    const payoutId = await tx(async (t) => {
      const [p] = await t.query<{ id: string }>(
        "insert into public.payouts (runner_id, amount_cents, status, provider, receiver) values ($1, $2, 'pending', $3, $4) returning id",
        [b.runner_id, b.amount, provider.mode, b.receiver ?? "demo"],
      );
      await t.query(
        "update public.runner_earnings set payout_id = $1 where runner_id = $2 and payout_id is null and available_at <= now()",
        [p.id, b.runner_id],
      );
      return p.id;
    });
    items.push({ payoutId, receiver: b.receiver ?? "demo", amountCents: b.amount, runnerId: b.runner_id });
  }
  if (items.length === 0) return { paid: 0, batchId: null };

  try {
    const res = await provider.payout(items, batchId);
    for (const r of res.items) {
      await q(
        `update public.payouts set status = $2, provider_ref = coalesce($3, $4), error = $5,
           paid_at = case when $2 = 'paid' then now() else paid_at end where id = $1`,
        [r.payoutId, r.status, r.ref ?? null, res.batchRef, r.error ?? null],
      );
      const item = items.find((i) => i.payoutId === r.payoutId)!;
      if (r.status === "paid") {
        await notify(item.runnerId, { category: "account", title: `Payout sent: $${(item.amountCents / 100).toFixed(2)}`, body: "Thanks for running.", url: "/run/earnings" });
      }
    }
  } catch (e) {
    // Release the lines so tomorrow's run retries them.
    for (const i of items) {
      await tx(async (t) => {
        await t.query("update public.runner_earnings set payout_id = null where payout_id = $1", [i.payoutId]);
        await t.query("update public.payouts set status = 'failed', error = $2 where id = $1", [i.payoutId, String((e as Error).message).slice(0, 500)]);
      });
    }
    throw e;
  }
  return { paid: items.length, batchId };
}

/** PayPal webhook: PAYMENT.PAYOUTS-ITEM.* */
export async function applyPayoutItemEvent(payoutId: string, eventType: string, itemRef: string | null, error: string | null) {
  if (eventType.endsWith("SUCCEEDED")) {
    await q("update public.payouts set status = 'paid', paid_at = now(), provider_ref = coalesce($2, provider_ref) where id = $1", [payoutId, itemRef]);
    return;
  }
  const terminalFailure = ["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "UNCLAIMED", "DENIED"].some((s) => eventType.endsWith(s));
  if (terminalFailure) {
    await tx(async (t) => {
      await t.query("update public.payouts set status = 'failed', error = $2 where id = $1", [payoutId, error ?? eventType]);
      // Give the money back to the runner's balance so it goes out next time.
      await t.query("update public.runner_earnings set payout_id = null where payout_id = $1", [payoutId]);
    });
    const [p] = await q<{ runner_id: string }>("select runner_id from public.payouts where id = $1", [payoutId]);
    if (p) {
      await notify(p.runner_id, {
        category: "account",
        title: "Payout didn't go through",
        body: "PayPal couldn't deliver your payout. Check your PayPal email in Earnings. We'll retry on the next run.",
        url: "/run/earnings",
      });
    }
  }
}
