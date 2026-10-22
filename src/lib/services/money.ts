import "server-only";
import type { Queryable } from "@/lib/db";
import { getPayments } from "@/lib/payments";
import type { OrderRow } from "./orders";

/**
 * Refund part of an order's payment through the provider and record it.
 * Must be called inside the transaction that holds the order lock.
 * Returns the amount actually refunded (capped at what's left).
 */
export async function refundOrder(t: Queryable, order: OrderRow, amountCents: number, memo: string): Promise<number> {
  const paid = order.payment_status === "succeeded" || order.payment_status === "partially_refunded";
  const remaining = order.total_cents - order.refunded_cents;
  const amount = Math.min(Math.max(0, Math.round(amountCents)), remaining);
  if (!paid || amount <= 0 || !order.capture_ref) return 0;
  const provider = getPayments();
  const { ref } = await provider.refund(order.capture_ref, amount, memo);
  const refunded = order.refunded_cents + amount;
  await t.query(
    "update public.orders set refunded_cents = $2, payment_status = $3 where id = $1",
    [order.id, refunded, refunded >= order.total_cents ? "refunded" : "partially_refunded"],
  );
  await t.query(
    "insert into public.ledger (order_id, user_id, kind, amount_cents, provider, provider_ref, memo) values ($1, $2, 'refund', $3, $4, $5, $6)",
    [order.id, order.customer_id, -amount, order.payment_provider, ref, memo],
  );
  order.refunded_cents = refunded;
  return amount;
}

export async function addEarning(
  t: Queryable,
  e: { runnerId: string; orderId: string | null; kind: "delivery_fee" | "tip" | "cancellation_fee" | "adjustment"; amountCents: number; holdHours: number; memo?: string },
) {
  if (e.amountCents === 0) return;
  await t.query(
    `insert into public.runner_earnings (runner_id, order_id, kind, amount_cents, available_at, memo)
     values ($1, $2, $3, $4, now() + make_interval(hours => $5), $6)`,
    [e.runnerId, e.orderId, e.kind, e.amountCents, e.holdHours, e.memo ?? ""],
  );
}

export async function recordPlatformFee(t: Queryable, order: OrderRow, amountCents: number, memo: string) {
  if (amountCents === 0) return;
  await t.query(
    "insert into public.ledger (order_id, kind, amount_cents, provider, memo) values ($1, 'platform_fee', $2, $3, $4)",
    [order.id, amountCents, order.payment_provider, memo],
  );
}
