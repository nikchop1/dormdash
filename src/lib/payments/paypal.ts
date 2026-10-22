import "server-only";
import { env } from "@/lib/env";
import { centsToValue, type PaymentsProvider } from "./types";

// PayPal REST: Orders v2 (checkout + capture), Payments v2 (refunds),
// Payouts v1 (runner payouts), Notifications v1 (webhook verification).

const base = () => (env.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}). Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV.`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function call<T>(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = data?.details?.[0]?.description || data?.message || `PayPal error ${res.status}`;
    const err = new Error(msg) as Error & { status: number; paypal: unknown };
    err.status = res.status;
    err.paypal = data;
    throw err;
  }
  return data as T;
}

export const paypalProvider: PaymentsProvider = {
  mode: "paypal",

  async createCheckout({ orderId, code, deliveryFeeCents, tipCents, totalCents }) {
    const data = await call<{ id: string }>("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: `checkout-${orderId}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            custom_id: orderId,
            invoice_id: `FD-${code}`,
            description: `FloorDrop delivery ${code}`,
            soft_descriptor: "FLOORDROP",
            amount: {
              currency_code: "USD",
              value: centsToValue(totalCents),
              breakdown: { item_total: { currency_code: "USD", value: centsToValue(totalCents) } },
            },
            items: [
              { name: "Delivery fee", quantity: "1", category: "DIGITAL_GOODS", unit_amount: { currency_code: "USD", value: centsToValue(deliveryFeeCents) } },
              ...(tipCents > 0
                ? [{ name: "Runner tip", quantity: "1", category: "DIGITAL_GOODS", unit_amount: { currency_code: "USD", value: centsToValue(tipCents) } }]
                : []),
            ],
          },
        ],
        payment_source: {
          paypal: { experience_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", brand_name: "FloorDrop" } },
        },
      },
    });
    return { ref: data.id };
  },

  async capture(ref) {
    try {
      const data = await call<{
        status: string;
        purchase_units: { payments?: { captures?: { id: string; status: string }[] } }[];
      }>(`/v2/checkout/orders/${encodeURIComponent(ref)}/capture`, { method: "POST", idempotencyKey: `capture-${ref}` });
      const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
      if (data.status === "COMPLETED" && cap && (cap.status === "COMPLETED" || cap.status === "PENDING")) {
        return { status: "succeeded", captureRef: cap.id };
      }
      return { status: "failed", message: "PayPal didn't complete the payment." };
    } catch (e) {
      const err = e as Error & { paypal?: { details?: { issue?: string }[] } };
      // Already captured (e.g. webhook beat us): look it up instead of failing.
      if (err.paypal?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
        const order = await call<{ purchase_units: { payments?: { captures?: { id: string }[] } }[] }>(
          `/v2/checkout/orders/${encodeURIComponent(ref)}`,
          { method: "GET" },
        );
        const id = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        if (id) return { status: "succeeded", captureRef: id };
      }
      return { status: "failed", message: err.message };
    }
  },

  async refund(captureRef, amountCents, note) {
    const data = await call<{ id: string }>(`/v2/payments/captures/${encodeURIComponent(captureRef)}/refund`, {
      method: "POST",
      idempotencyKey: `refund-${captureRef}-${amountCents}-${note.slice(0, 20).replace(/\W/g, "")}`,
      body: { amount: { currency_code: "USD", value: centsToValue(amountCents) }, note_to_payer: note.slice(0, 255) },
    });
    return { ref: data.id };
  },

  async payout(items, batchId) {
    const data = await call<{ batch_header: { payout_batch_id: string } }>("/v1/payments/payouts", {
      method: "POST",
      idempotencyKey: `payout-${batchId}`,
      body: {
        sender_batch_header: {
          sender_batch_id: batchId,
          email_subject: "You've got FloorDrop earnings",
          email_message: "Thanks for running. Here's your FloorDrop payout.",
        },
        items: items.map((i) => ({
          recipient_type: "EMAIL",
          receiver: i.receiver,
          amount: { currency: "USD", value: centsToValue(i.amountCents) },
          sender_item_id: i.payoutId,
          note: "FloorDrop runner earnings",
        })),
      },
    });
    // Item results arrive asynchronously via PAYMENT.PAYOUTS-ITEM.* webhooks.
    return {
      batchRef: data.batch_header.payout_batch_id,
      items: items.map((i) => ({ payoutId: i.payoutId, status: "processing" as const })),
    };
  },

  async verifyWebhook(headers, rawBody) {
    if (!env.paypal.webhookId) return null;
    const event = JSON.parse(rawBody) as Record<string, unknown>;
    const res = await call<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: env.paypal.webhookId,
        webhook_event: event,
      },
    });
    return res.verification_status === "SUCCESS" ? event : null;
  },
};
