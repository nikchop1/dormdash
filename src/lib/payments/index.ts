import "server-only";
import { randomToken } from "@/lib/crypto";
import { env, paymentsMode } from "@/lib/env";
import { stripeProvider } from "./stripe";
import type { PaymentsProvider } from "./types";

/**
 * Demo payments: no money moves. Charges, refunds, transfers and Connect identity
 * verification are simulated, but everything is written to the ledger and
 * runner_earnings exactly as it would be with Stripe, so the whole product works.
 */
export const demoProvider: PaymentsProvider = {
  mode: "demo",
  async createCheckout() {
    return { ref: `demo_pi_${randomToken(9)}`, clientSecret: null };
  },
  async capture() {
    return { status: "succeeded", captureRef: `demo_ch_${randomToken(9)}` };
  },
  async refund() {
    return { ref: `demo_re_${randomToken(9)}` };
  },
  async transfer() {
    return { ref: `demo_tr_${randomToken(9)}` };
  },
  async createConnectAccount() {
    return { accountId: `demo_acct_${randomToken(6)}` };
  },
  async onboardingLink(accountId) {
    // Demo "onboarding" is a page in the app that simulates Stripe's bank + identity steps.
    return { url: `${env.siteUrl}/run/payouts/demo-onboarding?account=${encodeURIComponent(accountId)}` };
  },
  async accountStatus() {
    return { payoutsEnabled: true, detailsSubmitted: true };
  },
  async verifyWebhook() {
    return null;
  },
};

export function getPayments(): PaymentsProvider {
  return paymentsMode === "stripe" ? stripeProvider : demoProvider;
}

export type { PaymentsProvider } from "./types";
