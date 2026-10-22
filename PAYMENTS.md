# Payments plan

**Short version:** Dormdash runs in **demo payments** mode out of the box (no money
moves, everything else works, including a simulated runner payout onboarding). To take
real money you need a Stripe account with **Connect** enabled and **three values** in
Vercel. Details below.

## What gets paid, by whom

| Money | Who pays | Who gets it | Through Dormdash? |
|---|---|---|---|
| The food | Customer | The restaurant, directly, in its own app/site/counter | **Never.** Dormdash never touches food money and nobody pays for anyone else's food. |
| Delivery fee | Customer | 75% to the runner, 25% to Dormdash (configurable in Admin > Pricing) | Yes |
| Tip | Customer | 100% to the runner | Yes |
| Delivery guarantee ($0.10 default) | Customer | The **Guarantee Fund** (pays lost-food refunds) | Yes, separate line, never surged |
| Cancellation fee ($0.50 default) | Customer, if they cancel after a runner claims | 100% to the runner | Yes (kept from the refund) |

Prices are always computed on the server (`src/lib/domain/pricing.ts`). The browser
never decides what anything costs. The delivery fee = base + distance + floor + order
size (by the food total from the receipt), times busy pricing, plus $0.50 per extra bag
(added after busy pricing).

**No holds of any kind.** Customers are charged once, at checkout, with automatic
capture: no authorization holds, no deposits, no card on file for runners. Runners are
paid the moment the customer's PIN is entered: no payout holding period.

## Why Stripe

The brief requires runners to finish payout onboarding (bank account + identity
verification) before they can claim jobs, and to be paid on completion. Stripe Connect
Express does exactly that: Stripe hosts the KYC and bank forms, and a Transfer moves the
runner's share to their connected account instantly. PayPal (used in an earlier build)
was removed.

## How the money moves

1. **Checkout.** Customer taps Pay. The server prices the order, creates it as
   `pending_payment`, applies any Dormdash credit (fees and tips only), and creates a
   PaymentIntent for the rest (`capture_method: automatic`, `transfer_group` = order id).
   The Stripe Payment Element collects the card / Apple Pay / Google Pay.
2. **Paid.** On success the browser calls `/api/orders/:id/capture`, which re-reads the
   PaymentIntent server-side; the `payment_intent.succeeded` webhook does the same as a
   backup (idempotent). The order goes on the board. The guarantee line is written to
   the ledger as `guarantee_in`. If credit covers everything, no PaymentIntent is made.
3. **Lobby handoff.** If the runner who claims can't go upstairs, the floor add-on is
   refunded right away (card first, then credit).
4. **Delivery.** The PIN is entered → earning lines (fee share + tip) → one Stripe
   **Transfer** to the runner's Express account (`source_transaction` = the charge, so it
   never waits on our balance). A failed transfer is retried by `/api/cron/payouts`
   (every 15 minutes) and the admin "Retry payouts" button.
5. **Customer not here.** Runner gets the whole delivery fee plus the tip; the customer
   gets nothing back. If the door location wasn't verified, the lines are marked `held`
   until an admin approves (pay) or rejects (refund) on the order log.
6. **Refunds.** Cancellations, late deliveries (fee only, automatic) and case decisions
   refund through `refunds.create`. Lost food (confirmed theft, accepted problem
   report): fee + tip + guarantee back the way they were paid, and the food value (capped
   at the entered total) as Dormdash credit. Cash refunds are booked against the
   Guarantee Fund (`guarantee_out`); any shortfall is booked as `fund_shortfall`
   (covered by platform revenue). Confirmed theft also deducts the runner's unpaid
   earnings into the fund (`runner_deduction`).
7. **Credit** is a platform liability tracked in `profiles.credit_cents` and the ledger
   (`credit_issued` / `credit_redeemed`). It never reduces what a runner is paid.

## Runner onboarding

`/run/earnings` → **Set up payouts** creates an Express account and sends the runner to
Stripe's hosted onboarding. When they come back (or on the `account.updated` webhook) we
store `payouts_enabled`. Runners can't go on shift or claim jobs until it's true. In
demo mode, the same button opens `/run/payouts/demo-onboarding`, which simulates it.

## Go-live checklist (Stripe)

1. Create a Stripe account for the legal entity that runs Dormdash. Activate it.
2. **Connect:** Dashboard > Connect > Get started. Choose **Express** accounts, platform
   pays fees, US. Fill in the platform profile (marketplace, delivery).
3. **Keys:** Developers > API keys. Copy the publishable key →
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, the secret key → `STRIPE_SECRET_KEY`. Use test
   mode keys first.
4. **Webhook:** Developers > Webhooks > Add endpoint →
   `https://YOUR-DOMAIN/api/webhooks/stripe`, events `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `account.updated` (choose "Events on Connected
   accounts" too for `account.updated`). Copy the signing secret →
   `STRIPE_WEBHOOK_SECRET`.
5. In Vercel set `PAYMENTS_PROVIDER=stripe` plus the three values, redeploy, and run a
   full order with Stripe test cards and a test Express account.
6. Swap to live keys and a live webhook. Redeploy.

If `PAYMENTS_PROVIDER=stripe` is set but a key is missing, the app stays in demo mode
instead of breaking, and the admin dashboard says so.

## Fees: read this before launch

Card processing is roughly 2.9% + $0.30 per charge in the US, and Connect adds a small
per-payout fee for Express accounts. On a ~$3.50 charge, that can eat most of
Dormdash's ~$0.75 cut. Options: raise the base fee or the platform cut (Admin >
Pricing); encourage credit; batch more orders per run (the run model already does).
Refunds don't return Stripe's fee.

## Taxes and compliance (not legal advice)

- Stripe Connect can issue 1099s to runners; decide with an accountant whether
  Dormdash files them (Stripe Tax reporting) and collects W-9s through onboarding.
- Dormdash collects for its own service and pays runners their share; food money never
  passes through it. Dormdash credit has no cash value and can't be withdrawn. Have a
  lawyer confirm money-transmission and stored-value treatment for New York.
