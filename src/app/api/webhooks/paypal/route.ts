import { q, q1 } from "@/lib/db";
import { paymentsMode } from "@/lib/env";
import { paypalProvider } from "@/lib/payments/paypal";
import { valueToCents } from "@/lib/payments/types";
import { markPaid } from "@/lib/services/orders";
import { applyPayoutItemEvent } from "@/lib/services/payouts";

/**
 * PayPal webhook. Every delivery is verified with PayPal's
 * verify-webhook-signature API (needs PAYPAL_WEBHOOK_ID) before we act on it.
 * Handlers are idempotent: PayPal retries, and the client capture may have
 * already done the same work.
 */
export async function POST(req: Request) {
  if (paymentsMode !== "paypal") return new Response("Payments are in demo mode", { status: 404 });
  const raw = await req.text();
  let event: Record<string, unknown> | null = null;
  try {
    event = await paypalProvider.verifyWebhook(req.headers, raw);
  } catch (e) {
    console.error("[paypal webhook] verify failed", e);
  }
  if (!event) return new Response("Invalid signature", { status: 400 });

  const type = String(event.event_type ?? "");
  const resource = (event.resource ?? {}) as Record<string, unknown>;
  try {
    switch (type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const orderId = String(resource.custom_id ?? "");
        if (orderId) await markPaid(orderId, String(resource.id));
        break;
      }
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED": {
        const orderId = String(resource.custom_id ?? "");
        if (orderId) await q("update public.orders set payment_status = 'failed' where id = $1 and status = 'pending_payment'", [orderId]);
        break;
      }
      case "PAYMENT.CAPTURE.REFUNDED": {
        // Refunds we started are already in the ledger. This catches refunds issued
        // from the PayPal dashboard so our numbers stay in sync.
        const captureId = (((resource.links as { rel: string; href: string }[]) ?? []).find((l) => l.rel === "up")?.href ?? "").split("/").pop();
        const amount = valueToCents(String((resource.amount as { value?: string })?.value ?? "0"));
        const refundId = String(resource.id);
        if (captureId && amount > 0) {
          const known = await q1("select 1 from public.ledger where provider_ref = $1", [refundId]);
          const o = await q1<{ id: string; customer_id: string; total_cents: number; refunded_cents: number }>("select id, customer_id, total_cents, refunded_cents from public.orders where capture_ref = $1", [captureId]);
          if (!known && o) {
            const total = Math.min(o.total_cents, o.refunded_cents + amount);
            await q("update public.orders set refunded_cents = $2, payment_status = $3 where id = $1", [o.id, total, total >= o.total_cents ? "refunded" : "partially_refunded"]);
            await q("insert into public.ledger (order_id, user_id, kind, amount_cents, provider, provider_ref, memo) values ($1,$2,'refund',$3,'paypal',$4,'Refund issued in PayPal dashboard')", [o.id, o.customer_id, -amount, refundId]);
          }
        }
        break;
      }
      default:
        if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
          const payoutId = String(resource.payout_item ? (resource.payout_item as { sender_item_id?: string }).sender_item_id ?? "" : "");
          const errors = resource.errors as { message?: string } | undefined;
          if (payoutId) await applyPayoutItemEvent(payoutId, type, String(resource.payout_item_id ?? ""), errors?.message ?? null);
        }
    }
  } catch (e) {
    console.error("[paypal webhook]", type, e);
    return new Response("Handler error", { status: 500 }); // PayPal will retry
  }
  return Response.json({ received: true });
}
