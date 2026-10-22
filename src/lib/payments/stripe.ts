import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import type { PaymentsProvider } from "./types";

// Stripe: PaymentIntents (automatic capture) for customers, Connect Express accounts
// + Transfers for runners. "Separate charges and transfers": the platform charges the
// customer, then transfers the runner's share to their connected account on delivery.

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(env.stripe.secretKey));

export const stripeProvider: PaymentsProvider = {
  mode: "stripe",

  async createCheckout({ orderId, code, amountCents, customerEmail }) {
    const pi = await stripe().paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        capture_method: "automatic",
        automatic_payment_methods: { enabled: true },
        description: `Dormdash delivery ${code}`,
        statement_descriptor_suffix: "DORMDASH",
        transfer_group: orderId,
        receipt_email: customerEmail ?? undefined,
        metadata: { orderId, code },
      },
      { idempotencyKey: `checkout-${orderId}` },
    );
    return { ref: pi.id, clientSecret: pi.client_secret };
  },

  async capture(ref) {
    const pi = await stripe().paymentIntents.retrieve(ref);
    if (pi.status === "succeeded") return { status: "succeeded", captureRef: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id };
    if (pi.status === "processing") return { status: "pending" };
    return { status: "failed", message: pi.last_payment_error?.message ?? "The payment wasn't completed." };
  },

  async refund(paymentRef, amountCents, note) {
    const r = await stripe().refunds.create(
      { payment_intent: paymentRef, amount: amountCents, metadata: { note: note.slice(0, 450) } },
      { idempotencyKey: `refund-${paymentRef}-${amountCents}-${note.slice(0, 24).replace(/\W/g, "")}` },
    );
    return { ref: r.id };
  },

  async transfer({ destination, amountCents, orderId, sourceCharge }) {
    const t = await stripe().transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination,
        transfer_group: orderId ?? undefined,
        // Tie the transfer to the customer's charge so funds are available immediately.
        source_transaction: sourceCharge ?? undefined,
        metadata: { orderId: orderId ?? "" },
      },
      { idempotencyKey: `transfer-${destination}-${orderId ?? "balance"}-${amountCents}` },
    );
    return { ref: t.id };
  },

  async createConnectAccount(email) {
    const a = await stripe().accounts.create({
      type: "express",
      country: "US",
      email,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { app: "dormdash" },
    });
    return { accountId: a.id };
  },

  async onboardingLink(accountId, returnUrl, refreshUrl) {
    const link = await stripe().accountLinks.create({ account: accountId, type: "account_onboarding", return_url: returnUrl, refresh_url: refreshUrl });
    return { url: link.url };
  },

  async accountStatus(accountId) {
    const a = await stripe().accounts.retrieve(accountId);
    return { payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted };
  },

  async verifyWebhook(headers, rawBody) {
    const sig = headers.get("stripe-signature");
    if (!sig || !env.stripe.webhookSecret) return null;
    try {
      return stripe().webhooks.constructEvent(rawBody, sig, env.stripe.webhookSecret) as unknown as Record<string, unknown>;
    } catch {
      return null;
    }
  },
};
