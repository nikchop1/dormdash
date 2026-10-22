import "server-only";
import { randomUUID } from "node:crypto";
import { q, q1, tx } from "@/lib/db";
import { getPayments } from "@/lib/payments";

/**
 * Pay a runner everything they're owed, right now. No holding period: this runs
 * the moment an order completes. Only `held` lines (unverified no-shows awaiting
 * admin review) wait. Stripe then pays the connected account out to the runner's
 * bank on Stripe's normal schedule.
 */
export async function payRunner(runnerId: string, orderId: string | null = null) {
  const runner = await q1<{ stripe_account_id: string | null; payouts_enabled: boolean }>(
    "select stripe_account_id, payouts_enabled from public.profiles where id = $1",
    [runnerId],
  );
  if (!runner?.stripe_account_id || !runner.payouts_enabled) return { paid: 0 };
  const provider = getPayments();
  const sourceCharge = orderId ? (await q1<{ capture_ref: string | null }>("select capture_ref from public.orders where id = $1", [orderId]))?.capture_ref ?? null : null;

  const payoutId = randomUUID();
  const amount = await tx(async (t) => {
    const [r] = await t.query<{ amount: number }>(
      "select coalesce(sum(amount_cents), 0)::int as amount from public.runner_earnings where runner_id = $1 and payout_id is null and not held",
      [runnerId],
    );
    if (!r || r.amount <= 0) return 0;
    await t.query(
      "insert into public.payouts (id, runner_id, amount_cents, status, provider, receiver) values ($1, $2, $3, 'pending', $4, $5)",
      [payoutId, runnerId, r.amount, provider.mode, runner.stripe_account_id],
    );
    await t.query("update public.runner_earnings set payout_id = $1 where runner_id = $2 and payout_id is null and not held", [payoutId, runnerId]);
    return r.amount;
  });
  if (amount <= 0) return { paid: 0 };

  try {
    const { ref } = await provider.transfer({ destination: runner.stripe_account_id, amountCents: amount, orderId, sourceCharge });
    await q("update public.payouts set status = 'paid', provider_ref = $2, paid_at = now() where id = $1", [payoutId, ref]);
    await q(
      "insert into public.ledger (order_id, user_id, kind, amount_cents, provider, provider_ref, memo) values ($1, $2, 'payout', $3, $4, $5, 'Runner payout')",
      [orderId, runnerId, -amount, provider.mode, ref],
    );
    return { paid: amount };
  } catch (e) {
    // Put the lines back so the retry cron picks them up.
    await tx(async (t) => {
      await t.query("update public.runner_earnings set payout_id = null where payout_id = $1", [payoutId]);
      await t.query("update public.payouts set status = 'failed', error = $2 where id = $1", [payoutId, String((e as Error).message).slice(0, 500)]);
    });
    console.error("[payout]", e);
    return { paid: 0 };
  }
}

/** Retry any runner with unpaid, unheld earnings (failed transfers, newly released reviews). */
export async function retryPayouts() {
  const rows = await q<{ runner_id: string }>(
    "select distinct runner_id from public.runner_earnings where payout_id is null and not held",
  );
  let paid = 0;
  for (const r of rows) paid += (await payRunner(r.runner_id)).paid;
  return { runners: rows.length, paidCents: paid };
}
