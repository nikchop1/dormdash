import { q1 } from "@/lib/db";
import { paymentsMode } from "@/lib/env";
import { stripeProvider } from "@/lib/payments/stripe";
import { markPaid } from "@/lib/services/orders";
import { syncPayoutStatus } from "@/lib/services/runners";

/**
 * Stripe webhook. Every delivery is verified with the signing secret
 * (STRIPE_WEBHOOK_SECRET) before we act on it. Handlers are idempotent.
 */
export async function POST(req: Request) {
  if (paymentsMode !== "stripe") return new Response("Payments are in demo mode", { status: 404 });
  const raw = await req.text();
  const event = await stripeProvider.verifyWebhook(req.headers, raw);
  if (!event) return new Response("Invalid signature", { status: 400 });
  const type = String(event.type ?? "");
  const obj = ((event.data as { object?: Record<string, unknown> })?.object ?? {}) as Record<string, unknown>;
  try {
    if (type === "payment_intent.succeeded") {
      const orderId = String((obj.metadata as { orderId?: string })?.orderId ?? "");
      if (orderId) await markPaid(orderId, typeof obj.latest_charge === "string" ? obj.latest_charge : null);
    } else if (type === "account.updated") {
      const p = await q1<{ id: string }>("select id from public.profiles where stripe_account_id = $1", [String(obj.id)]);
      if (p) await syncPayoutStatus(p.id);
    }
  } catch (e) {
    console.error("[stripe webhook]", type, e);
    return new Response("Handler error", { status: 500 }); // Stripe retries
  }
  return Response.json({ received: true });
}
