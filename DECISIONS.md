# Decisions and assumptions

Everything below was decided without asking, per the brief. Each line says what and why.

## Platform and architecture

- **Next.js 16.4 (App Router).** Latest at build time. Next 16 renamed `middleware.ts` to **`proxy.ts`** (same feature), so route protection lives in `src/proxy.ts`.
- **`cacheComponents` is off.** Every screen is per-user and live; Cache Components would force Suspense boundaries around every cookie read for no benefit. Pages that read the database are explicitly dynamic.
- **Server data access is SQL over a direct Postgres connection** (`DATABASE_URL`, Supabase's transaction pooler) instead of the Supabase JS query builder. One set of SQL runs against Supabase in production and against the local database in dev/tests.
- **RLS is real and enforced in two layers.** Every table has RLS. User-scoped server reads run as the user (`asUser()`: `set local role authenticated` + JWT claims, exactly what Supabase's Data API does), so RLS applies to server code too. Writes go through server routes that check permissions explicitly and use the privileged connection; clients get no write policies except a few narrow, column-limited self-service updates (own profile fields, own notification prefs, mark own notifications read, own shifts/push subscriptions).
- **Local mode with zero accounts.** With no env vars, the app runs on **PGlite** (real Postgres compiled to WASM, in `.data/pglite`), a local auth implementation that mirrors Supabase Auth (same `auth.users` table, same `/auth/confirm?token_hash=&type=` email links), local disk storage with HMAC-signed URLs, demo payments, and a dev email outbox at `/dev/outbox`. The same migrations and RLS policies run locally (`scripts/local-bootstrap.sql` stubs the bits of Supabase they depend on). This is what makes the full test suite runnable without Supabase/PayPal accounts.
- **Vercel requires real services.** On Vercel, missing `DATABASE_URL`/Supabase keys/`APP_SECRET`/`CRON_SECRET` is a startup error, not a silent fallback to local mode.
- **Realtime:** Supabase Realtime (`postgres_changes` on `orders`, `notifications`, `order_events`, RLS-filtered) when configured; light polling of tiny "version" endpoints otherwise, and as a safety net in production.

## Auth

- **Unverified users get a "Verify your email" screen instead of a session.** Supabase (with email confirmation on, the secure default) refuses sessions for unconfirmed emails. So signup and login for unverified accounts set a signed `fd_pending` cookie and land on `/verify-email` (with resend + 60s cooldown). They can't order or apply to run because they never get a session. Local mode behaves the same.
- **Email links use the token-hash flow** (`/auth/confirm?token_hash=...&type=...` + `verifyOtp`), which Supabase recommends for SSR and which works across browsers. Requires updating the Supabase email templates (provided in `supabase/templates/`, steps in README).
- **Duplicate email/phone checks happen server-side before signup**, because Supabase intentionally hides "email already registered" (anti-enumeration). The product requirement asked for a friendly duplicate message; that trades a little enumeration resistance for UX. Forgot-password still answers identically for unknown emails.
- **Phone:** US numbers only, normalized to E.164, unique. **No SMS verification yet** (future: Supabase phone OTP or Twilio Verify).
- **Lockout:** 5 wrong passwords per email = 15-minute lock, plus 30 attempts per IP per 15 minutes. Rate limits are stored in Postgres so they work across serverless instances.
- **Admin bootstrap:** `ADMIN_EMAILS` is checked on every session load, so it applies on signup, verification and login.
- **Account deletion** scrubs the profile (name/email/phone/room/photo), deletes the auth user, and keeps anonymized order rows so runners' earnings and the ledger stay correct. Profiles intentionally have no FK to `auth.users` for this reason. Blocked during an active order or open dispute.

## Payments

- **PayPal instead of Stripe Connect**, at your request mid-build (simpler: runners just give a PayPal email; customers can use Venmo). Full plan and tradeoffs in `PAYMENTS.md`. Demo mode is the default and records everything in the ledger exactly as live mode would.
- **Daily batched payouts with a 24-hour hold** instead of paying on each delivery: PayPal payouts can't be clawed back once sent, and per-order payouts of ~$3 would cost a fee each. Clawbacks from upheld disputes become negative earning lines that net against the next payout.
- **Late delivery:** customer gets the delivery fee back automatically; the runner keeps only the tip and gets a strike. Platform takes no fee on that order.
- **Upheld dispute "refund fee":** refunds the fee, claws back the runner's fee share and reverses the platform fee. "Refund tip" claws back the tip.
- **Customer cancel after claim:** refund minus the runner's $0.50, which goes to the runner. Admin cancels refund everything and pay no runner fee.

## Product rules (all admin-configurable unless noted)

- **"Weeknights" = Sunday through Thursday nights, 9pm to 1am. "Weekend nights" = Friday and Saturday, 8pm to 2am.** A window that crosses midnight belongs to the day it starts on. Weather surge is a manual toggle (default 1.5x). If several apply, the highest multiplier wins. Surge multiplies the delivery fee, never the tip. Scheduled orders are priced for their delivery time.
- **Repeated unclaims:** the first unclaim in a rolling 7 days is free; each one after that is a strike.
- **Strikes** count while not voided. At 3 the runner is auto-suspended and taken off shift. Admin "Reinstate" clears strikes.
- **Unclaimed orders:** at 10 minutes runners get re-pinged; at 20 minutes the customer is told they can cancel for a full refund (cancelling before claim is always free anyway). Scheduled orders start this clock 30 minutes before their time and appear on the board 45 minutes before.
- **ETA** = walk to spot and back at 3 mph + 4 min pickup wait + elevator time by floor + 3 min per extra order in a batch, minimum 8 minutes; for scheduled orders, never earlier than the scheduled time.
- **Batches:** same destination building, pickup spots the same or within ~0.06 mi, sorted by floor, capped by the runner's remaining capacity (max 4 active orders).
- **Lobby handoff:** if the building requires a resident card and the runner's home building (from their approved application) isn't it. Customers are told before paying, including how many resident runners are on shift.
- **Handoff PIN** lives in a separate table that only the customer (and admins) can read. 5 wrong PINs lock PIN entry; the runner must use a door photo.
- **No runners on shift:** ASAP ordering is blocked with the next covered window; scheduling is limited to 15-minute slots inside hours where runners are scheduled (up to 3 days out).
- **Customers can have 3 active orders.** Order creation is rate-limited (8 per 10 minutes).
- **Problem reports** within 72 hours of delivery, one open report per order. Photo required for "wrong items" and "wrong room".
- **Dining halls** exist but are off via the `dining_halls_enabled` flag.
- **Max radius 0.25 mi.** A spot/building pair beyond the radius can't be switched on; changing the radius re-applies it to every pair.

## Data, privacy, storage

- **Storage buckets:** `avatars` (public), `id-photos` and `order-photos` (private, short-lived signed URLs). All uploads go through the server, which checks type by magic bytes (JPEG/PNG/WebP) and size (4 MB). Browsers downscale photos before upload to stay under Vercel's 4.5 MB body limit.
- **Runner rating** is exposed to customers only as an aggregate through security-definer functions; individual ratings stay private.
- **Placeholder seed data:** building names, addresses and coordinates are placeholders, and spot names are generic on purpose (FloorDrop has no restaurant partnerships). All spots are flagged "verify before launch".
- **"Not affiliated with NYU"** is stated in the footer and Terms. NYU violet isn't used anywhere.

## Background jobs

- **Vercel Cron** runs `/api/cron/unclaimed`, `/api/cron/late`, `/api/cron/surge` every minute and `/api/cron/payouts` daily at 14:00 UTC (10am New York, 9am in winter). **Every-minute crons need a Vercel Pro plan**; the Hobby plan only runs crons once a day. On Hobby, use an external pinger (e.g. cron-job.org) hitting the same URLs with the `Authorization: Bearer $CRON_SECRET` header.

## Notifications and email

- Every notification is stored in-app; push and email follow the user's per-category preferences. Runner approval/rejection emails always send (account-critical). Auth emails (verify, reset, email change) are Supabase's own emails using our templates. Transactional emails go through Resend when `RESEND_API_KEY` is set, and are logged otherwise.
- **Push** uses standard Web Push (VAPID). On iPhone it works only after "Add to Home Screen" (iOS 16.4+); the settings screen says so.

## Design

- One accent, **mustard** (`#EFB21C`, cab yellow / deli mustard). Display face **Big Shoulders**, text face **IBM Plex Sans**. Full system in `DESIGN.md`; audit in `DESIGN_AUDIT.md`.

## Testing

- Unit tests (Vitest) for pricing, distance, time zones, the order state machine, cancellations, lateness, strikes and batching. Integration tests run the real route handlers against a real in-memory Postgres with the real migrations and RLS. Playwright runs the full browser flow against a production build with its own database.
- No CI workflows, per instructions. Run `npm run test:all` locally.

## Not built (yet)

- SMS phone verification; Stripe provider; prepaid credit; in-app chat between customer and runner (customers' phone numbers are shown to their runner instead); multi-campus support (single allowed-domain list today); maps.
