export type CheckoutInput = {
  orderId: string;
  code: string;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
};

export type PayoutItem = { payoutId: string; receiver: string; amountCents: number };

export type PayoutResult = {
  batchRef: string;
  items: { payoutId: string; status: "paid" | "processing" | "failed"; ref?: string; error?: string }[];
};

export interface PaymentsProvider {
  mode: "paypal" | "demo";
  /** Create the provider-side checkout. Returns the reference the client approves. */
  createCheckout(input: CheckoutInput): Promise<{ ref: string }>;
  /** Capture an approved checkout. */
  capture(ref: string): Promise<{ status: "succeeded" | "failed"; captureRef?: string; message?: string }>;
  refund(captureRef: string, amountCents: number, note: string): Promise<{ ref: string }>;
  payout(items: PayoutItem[], batchId: string): Promise<PayoutResult>;
  /** Verify a webhook delivery. Returns the parsed event or null if it isn't genuine. */
  verifyWebhook(headers: Headers, rawBody: string): Promise<Record<string, unknown> | null>;
}

export const centsToValue = (c: number) => (c / 100).toFixed(2);
export const valueToCents = (v: string) => Math.round(parseFloat(v) * 100);
