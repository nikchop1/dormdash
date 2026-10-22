import "server-only";
import { randomToken } from "@/lib/crypto";
import { paymentsMode } from "@/lib/env";
import { paypalProvider } from "./paypal";
import type { PaymentsProvider } from "./types";

/**
 * Demo payments: no money moves. Everything is still written to the ledger,
 * runner_earnings and payouts tables exactly as it would be with PayPal, so the
 * whole product (refunds, payouts, KPIs) works end to end.
 */
export const demoProvider: PaymentsProvider = {
  mode: "demo",
  async createCheckout() {
    return { ref: `demo_${randomToken(9)}` };
  },
  async capture() {
    return { status: "succeeded", captureRef: `democap_${randomToken(9)}` };
  },
  async refund() {
    return { ref: `demorefund_${randomToken(9)}` };
  },
  async payout(items, batchId) {
    return { batchRef: `demobatch_${batchId}`, items: items.map((i) => ({ payoutId: i.payoutId, status: "paid" as const, ref: `demopay_${randomToken(6)}` })) };
  },
  async verifyWebhook() {
    return null;
  },
};

export function getPayments(): PaymentsProvider {
  return paymentsMode === "paypal" ? paypalProvider : demoProvider;
}

export type { PaymentsProvider } from "./types";
