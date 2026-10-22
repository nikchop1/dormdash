export type CheckoutInput = {
  orderId: string;
  code: string;
  /** What to charge the card (total minus any Dormdash credit). */
  amountCents: number;
  customerEmail: string | null;
};

export interface PaymentsProvider {
  mode: "stripe" | "demo";
  /** Create the charge. Captured immediately once confirmed: no authorization holds. */
  createCheckout(input: CheckoutInput): Promise<{ ref: string; clientSecret: string | null }>;
  /** Confirm the payment went through. Returns the charge reference used for refunds/transfers. */
  capture(ref: string): Promise<{ status: "succeeded" | "pending" | "failed"; captureRef?: string; message?: string }>;
  refund(paymentRef: string, amountCents: number, note: string): Promise<{ ref: string }>;
  /** Pay a runner's connected account right away (no holding period). */
  transfer(i: { destination: string; amountCents: number; orderId: string | null; sourceCharge: string | null }): Promise<{ ref: string }>;
  /** Runner payouts setup (Stripe Connect Express: bank + identity verification). */
  createConnectAccount(email: string): Promise<{ accountId: string }>;
  onboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>;
  accountStatus(accountId: string): Promise<{ payoutsEnabled: boolean; detailsSubmitted: boolean }>;
  /** Verify a webhook delivery. Returns the parsed event or null if it isn't genuine. */
  verifyWebhook(headers: Headers, rawBody: string): Promise<Record<string, unknown> | null>;
}
