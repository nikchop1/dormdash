import "server-only";
import type { Queryable } from "@/lib/db";
import { getPayments } from "@/lib/payments";
import { fundSplit, lostOrderRefund } from "@/lib/domain/refunds";
import type { OrderRow } from "./orders";

/**
 * Refund part of what the customer paid by card, through the provider, and record it.
 * Call inside the transaction that holds the order lock. Returns the amount refunded.
 */
export async function refundOrder(t: Queryable, order: OrderRow, amountCents: number, memo: string): Promise<number> {
  const paid = order.payment_status === "succeeded" || order.payment_status === "partially_refunded";
  const remaining = order.charged_cents - order.refunded_cents;
  const amount = Math.min(Math.max(0, Math.round(amountCents)), remaining);
  if (!paid || amount <= 0 || !order.payment_ref) return 0;
  const { ref } = await getPayments().refund(order.payment_ref, amount, memo);
  const refunded = order.refunded_cents + amount;
  await t.query("update public.orders set refunded_cents = $2, payment_status = $3 where id = $1", [
    order.id,
    refunded,
    refunded >= order.charged_cents ? "refunded" : "partially_refunded",
  ]);
  await ledger(t, { orderId: order.id, userId: order.customer_id, kind: "refund", amountCents: -amount, provider: order.payment_provider, ref, memo });
  order.refunded_cents = refunded;
  return amount;
}

export async function ledger(
  t: Queryable,
  e: { orderId?: string | null; userId?: string | null; kind: string; amountCents: number; provider?: string; ref?: string | null; memo: string },
) {
  if (e.amountCents === 0) return;
  await t.query(
    "insert into public.ledger (order_id, user_id, kind, amount_cents, provider, provider_ref, memo) values ($1, $2, $3, $4, $5, $6, $7)",
    [e.orderId ?? null, e.userId ?? null, e.kind, e.amountCents, e.provider ?? "system", e.ref ?? null, e.memo],
  );
}

/** Add an earning line. `held` only for no-shows whose location couldn't be verified. */
export async function addEarning(
  t: Queryable,
  e: { runnerId: string; orderId: string | null; kind: "delivery_fee" | "tip" | "cancellation_fee" | "adjustment"; amountCents: number; held?: boolean; memo?: string },
) {
  if (e.amountCents === 0) return;
  await t.query(
    "insert into public.runner_earnings (runner_id, order_id, kind, amount_cents, held, memo) values ($1, $2, $3, $4, $5, $6)",
    [e.runnerId, e.orderId, e.kind, e.amountCents, !!e.held, e.memo ?? ""],
  );
}

export async function recordPlatformFee(t: Queryable, order: OrderRow, amountCents: number, memo: string) {
  await ledger(t, { orderId: order.id, kind: "platform_fee", amountCents, provider: order.payment_provider, memo });
}

// ---------------------------------------------------------------------------
// Credits and the Guarantee Fund
// ---------------------------------------------------------------------------

export async function issueCredit(t: Queryable, userId: string, cents: number, orderId: string | null, memo: string) {
  if (cents <= 0) return;
  await t.query("update public.profiles set credit_cents = credit_cents + $2 where id = $1", [userId, cents]);
  await ledger(t, { orderId, userId, kind: "credit_issued", amountCents: cents, memo });
}

/** Called at checkout. Credits pay fees/tips only and are funded by the platform. */
export async function redeemCredit(t: Queryable, userId: string, cents: number, orderId: string) {
  if (cents <= 0) return;
  const [r] = await t.query<{ credit_cents: number }>(
    "update public.profiles set credit_cents = credit_cents - $2 where id = $1 and credit_cents >= $2 returning credit_cents",
    [userId, cents],
  );
  if (!r) throw new Error("Credit balance changed. Refresh and try again.");
  await ledger(t, { orderId, userId, kind: "credit_redeemed", amountCents: cents, memo: "Credit applied at checkout" });
}

/** Cash in the Guarantee Fund: guarantee lines + theft deductions − refunds paid from it. */
export async function fundBalance(t: Queryable): Promise<number> {
  const [r] = await t.query<{ b: number }>(
    `select coalesce(sum(case when kind in ('guarantee_in','runner_deduction') then amount_cents
                              when kind = 'guarantee_out' then -amount_cents else 0 end), 0)::int as b
     from public.ledger where kind in ('guarantee_in','runner_deduction','guarantee_out')`,
  );
  return r?.b ?? 0;
}

export type LostRefund = { cashCents: number; creditCents: number; fromFund: number; shortfall: number };

/**
 * Section 11 refund policy for lost food (confirmed theft, accepted runner problem):
 * delivery fee + tip + guarantee back the way they were paid, food value as credit.
 * Cash comes out of the Guarantee Fund first; platform revenue covers any shortfall.
 */
export async function applyLostOrderRefund(t: Queryable, o: OrderRow, why: string): Promise<LostRefund> {
  const split = lostOrderRefund({
    deliveryFeeCents: o.delivery_fee_cents,
    tipCents: o.tip_cents,
    guaranteeCents: o.guarantee_cents,
    foodValueCents: o.food_value_cents,
    chargedCents: o.charged_cents,
    creditAppliedCents: o.credit_applied_cents,
    refundedCents: o.refunded_cents,
  });
  const cash = await refundOrder(t, o, split.cashCents, `${why}, order ${o.code}`);
  const { fromFund, shortfall } = fundSplit(cash, await fundBalance(t));
  await ledger(t, { orderId: o.id, kind: "guarantee_out", amountCents: fromFund, memo: `Paid from Guarantee Fund: ${why}` });
  await ledger(t, { orderId: o.id, kind: "fund_shortfall", amountCents: shortfall, memo: `Covered by platform revenue: ${why}` });
  await issueCredit(t, o.customer_id, split.creditCents, o.id, `${why}: food value${split.creditCents > split.foodCreditCents ? " + fees paid with credit" : ""}`);
  return { cashCents: cash, creditCents: split.creditCents, fromFund, shortfall };
}
