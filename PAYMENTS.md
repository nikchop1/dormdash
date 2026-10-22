# Payments plan

**Short version:** Dormdash runs in **demo payments** mode out of the box (no money
moves, everything else works). To take real money you need a PayPal Business account
and to paste **three values** into Vercel. Then flip one switch. Details below.

## What gets paid, by whom

| Money | Who pays | Who gets it | Through Dormdash? |
|---|---|---|---|
| The food | Customer | The restaurant, directly, in its own app/site/counter | **Never.** Dormdash never touches food money. |
| Delivery fee | Customer | 75% to the runner, 25% to Dormdash (configurable in Admin > Pricing) | Yes |
| Tip | Customer | 100% to the runner | Yes |
| Cancellation fee ($0.50 default) | Customer, if they cancel after a runner claims | 100% to the runner | Yes (kept from the refund) |

Prices are always computed on the server (`src/lib/domain/pricing.ts`). The browser
never decides what anything costs.

## Why PayPal (and not Stripe)

You asked for the simplest setup. PayPal wins on that for this business:

| | PayPal | Stripe Connect |
|---|---|---|
| Runner onboarding | Runner types their PayPal email. Done. | Each runner completes Stripe's identity/bank onboarding (Express account) |
| Platform setup | Business account + app credentials. Payouts needs PayPal's approval (usually a few days) | Account + Connect platform profile + review |
| Customers | PayPal **and Venmo** (Venmo shows on mobile in the US, which is what students use), plus cards via PayPal | Cards, Apple/Google Pay |
| Tax forms for runners | PayPal issues 1099-Ks to recipients who cross IRS thresholds | Stripe can issue 1099s for you (more automated) |
| Clawbacks after payout | Not possible once sent, so we **hold earnings 24h** and pay out daily | Transfer reversals possible |

Stripe is the more "industrial" marketplace option (better KYC and tax tooling) if
Dormdash grows into a real company with many runners. The code keeps payments behind
one interface (`src/lib/payments/types.ts`), so adding a Stripe provider later is a
contained change: implement `createCheckout`, `capture`, `refund`, `payout`,
`verifyWebhook`.

## How the money moves (PayPal mode)

1. **Checkout.** Customer taps Pay. The server prices the order, creates it as
   `pending_payment`, and creates a PayPal order for delivery fee + tip
   (`/v2/checkout/orders`). The PayPal/Venmo buttons pop up.
2. **Capture.** On approval the server captures the payment
   (`/v2/checkout/orders/{id}/capture`). The order goes on the job board. A
   `PAYMENT.CAPTURE.COMPLETED` webhook does the same thing as a backup (idempotent).
   Checkouts abandoned for 30 minutes are cancelled by cron.
3. **Refunds.** Cancellations, late deliveries (fee only, automatic), and dispute
   decisions refund through `/v2/payments/captures/{id}/refund`. Every refund is
   written to the `ledger` table. Refunds issued by hand in the PayPal dashboard are
   picked up by the `PAYMENT.CAPTURE.REFUNDED` webhook so the books stay in sync.
4. **Runner earnings.** On delivery the runner gets earning lines (fee share + tip)
   in `runner_earnings`, available after a **24-hour hold** (configurable). If a
   dispute is upheld in that window, a negative "adjustment" line claws it back.
5. **Payouts.** Daily cron (`/api/cron/payouts`, 14:00 UTC) sums each runner's
   available balance and, if it's at least $1.00, sends one PayPal Payout to their
   PayPal email (`/v1/payments/payouts`). Item results come back via
   `PAYMENT.PAYOUTS-ITEM.*` webhooks; failed or unclaimed payouts go back into the
   runner's balance and they get a notification to fix their email. Admins can also
   run it on demand from the admin dashboard ("Run payouts now").

## Go-live checklist (PayPal)

1. **Business account:** sign up at paypal.com/business (or upgrade a personal account). Use the legal entity that will run Dormdash.
2. **App credentials:** developer.paypal.com > Apps & Credentials > *Create App* (type: Merchant). Toggle to **Sandbox** first. Copy:
   - Client ID → `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
   - Secret → `PAYPAL_CLIENT_SECRET`
3. **Enable Payouts** on the app (Features > Payouts). For **live**, PayPal must approve it for your business account (request it from your PayPal business dashboard; it can take a few days). Until approved, live payouts will fail and stay in runners' balances.
4. **Webhook:** in the app, *Add Webhook* → URL `https://YOUR-DOMAIN/api/webhooks/paypal`, events:
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`,
   `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.BLOCKED`,
   `PAYMENT.PAYOUTS-ITEM.RETURNED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`, `PAYMENT.PAYOUTS-ITEM.DENIED`.
   Copy the **Webhook ID** → `PAYPAL_WEBHOOK_ID`.
5. In Vercel set `PAYMENTS_PROVIDER=paypal`, `PAYPAL_ENV=sandbox`, redeploy, and test with PayPal sandbox buyer/runner accounts (developer.paypal.com > Sandbox accounts).
6. Repeat steps 2 and 4 with the toggle on **Live**, paste the live values, set `PAYPAL_ENV=live`, redeploy.

If `PAYMENTS_PROVIDER=paypal` is set but the client ID or secret is missing, the app
stays in demo mode instead of breaking, and the admin dashboard says so.

## Fees: read this before launch

Card/PayPal processing has a fixed per-transaction fee (roughly $0.30 to $0.49 plus a
few percent in the US; check PayPal's current merchant fees). On a **$3.00** order
that can eat most of Dormdash's **$0.75** cut. Options, in order of impact:

- Ask PayPal for **micropayments pricing** (lower fixed fee, built for transactions under ~$10).
- Raise the base fee or the platform cut (Admin > Pricing).
- Later: prepaid **Dormdash credit** (load $10, spend it down) so one card fee covers many orders.

Refunds don't return PayPal's fixed fee, so frequent cancellations also cost money.
Watch "Platform revenue" vs "refunded" on the admin dashboard.

## Taxes and compliance (not legal advice)

- Runners are paid as independent platform users. PayPal reports payments to
  recipients on 1099-K above IRS thresholds. Talk to an accountant about whether
  Dormdash should also collect W-9s and issue 1099-NECs.
- Money-transmission rules: Dormdash collects for its own service (delivery) and pays
  runners from its own balance; it doesn't hold customer funds for third parties. Have
  a lawyer confirm this structure for New York.
