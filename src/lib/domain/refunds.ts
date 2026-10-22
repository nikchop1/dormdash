// Refund policy when food is lost (confirmed theft, accepted runner problem report).
// Never applies to customer no-shows.

export type LostOrder = {
  deliveryFeeCents: number;
  tipCents: number;
  guaranteeCents: number;
  foodValueCents: number;
  /** Paid by card. */
  chargedCents: number;
  /** Paid with Dormdash credit. */
  creditAppliedCents: number;
  /** Already refunded to the card (e.g. a lobby floor-fee refund). */
  refundedCents: number;
};

export type RefundSplit = {
  /** Back to the original payment method. */
  cashCents: number;
  /** Dormdash credit: food value (capped at the entered total) plus any fees that were paid with credit. */
  creditCents: number;
  foodCreditCents: number;
};

/**
 * Delivery fee + tip + guarantee go back the way they were paid: card money to the
 * card, credit to credit. Food value comes back as credit only, capped at the total
 * the customer entered at checkout.
 */
export function lostOrderRefund(o: LostOrder): RefundSplit {
  const paid = o.deliveryFeeCents + o.tipCents + o.guaranteeCents;
  const cardLeft = Math.max(0, o.chargedCents - o.refundedCents);
  const cashCents = Math.min(cardLeft, paid);
  const creditBack = Math.min(o.creditAppliedCents, Math.max(0, paid - cashCents));
  const foodCreditCents = Math.max(0, o.foodValueCents);
  return { cashCents, creditCents: creditBack + foodCreditCents, foodCreditCents };
}

/** Cash refunds come out of the Guarantee Fund first; any shortfall is covered by platform revenue. */
export function fundSplit(cashCents: number, fundBalanceCents: number) {
  const fromFund = Math.max(0, Math.min(cashCents, fundBalanceCents));
  return { fromFund, shortfall: cashCents - fromFund };
}
