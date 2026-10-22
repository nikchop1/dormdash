# Decisions and assumptions

Everything below was decided without asking, per the brief. Each line says what and why.

## Platform and architecture

- **Next.js 16.4 (App Router).** Latest at build time. Next 16 renamed `middleware.ts` to **`proxy.ts`** (same feature), so route protection lives in `src/proxy.ts`.
- **`cacheComponents` is off.** Every screen is per-user and live; Cache Components would force Suspense boundaries around every cookie read for no benefit. Pages that read the database are explicitly dynamic.
- **Server data access is SQL over a direct Postgres connection** (`DATABASE_URL`, Supabase's transaction pooler) instead of the Supabase JS query builder. One set of SQL runs against Supabase in production and against the local database in dev/tests.
- **RLS is real and enforced in two layers.** Every table has RLS. User-scoped server reads run as the user (`asUser()`: `set local role authenticated` + JWT claims, exactly what Supabase's Data API does), so RLS applies to server code too. Writes go through server routes that check permissions explicitly and use the privileged connection; clients get no write policies except a few narrow, column-limited self-service updates (own profile fields, own notification prefs, mark own notifications read, own shifts/push subscriptions).
- **Local mode with zero accounts.** With no env vars, the app runs on **PGlite** (real Postgres compiled to WASM, in `.data/pglite`), a local auth implementation that mirrors Supabase Auth (same `auth.users` table, same `/auth/confirm?token_hash=&type=` email links), local disk storage with HMAC-signed URLs, demo payments, and a dev email outbox at `/dev/outbox`. The same migrations and RLS policies run locally (`scripts/local-bootstrap.sql` stubs the bits of Supabase they depend on). This is what makes the full test suite runnable without Supabase/Stripe accounts.
- **Vercel requires real services.** On Vercel, missing `DATABASE_URL`/Supabase keys/`APP_SECRET`/`CRON_SECRET` is a startup error, not a silent fallback to local mode.
- **Realtime:** Supabase Realtime (`postgres_changes` on `orders`, `notifications`, `order_events`, RLS-filtered) when configured; light polling of tiny "version" endpoints otherwise, and as a safety net in production.

## Auth

- **Unverified users get a "Verify your email" screen instead of a session.** Supabase (with email confirmation on, the secure default) refuses sessions for unconfirmed emails. So signup and login for unverified accounts set a signed `fd_pending` cookie and land on `/verify-email` (with resend + 60s cooldown). They can't order or apply to run because they never get a session. Local mode behaves the same.
- **Email links use the token-hash flow** (`/auth/confirm?token_hash=...&type=...` + `verifyOtp`), which Supabase recommends for SSR and which works across browsers. Requires updating the Supabase email templates (provided in `supabase/templates/`, steps in README).
- **Duplicate email/phone checks happen server-side before signup**, because Supabase intentionally hides "email already registered" (anti-enumeration). The product requirement asked for a friendly duplicate message; that trades a little enumeration resistance for UX. Forgot-password still answers identically for unknown emails.
- **Phone:** US numbers only, normalized to E.164, unique. **No SMS verification yet** (future: Supabase phone OTP or Twilio Verify).
- **Lockout:** 5 wrong passwords per email = 15-minute lock, plus 30 attempts per IP per 15 minutes. Rate limits are stored in Postgres so they work across serverless instances.
- **Admin bootstrap:** `ADMIN_EMAILS` is checked on every session load, so it applies on signup, verification and login.
- **Account deletion** scrubs the profile (name/email/phone/room/photo), deletes the auth user, and keeps anonymized order rows so runners' earnings and the ledger stay correct. Profiles intentionally have no FK to `auth.users` for this reason. Blocked during an active order or open case.

## Payments

- **Stripe end to end (PaymentIntents + Connect Express), replacing PayPal.** The new rules require runners to finish payout onboarding (bank + identity) before claiming and to be paid on completion; Connect Express does both with hosted KYC and instant Transfers. Full flow and go-live steps in `PAYMENTS.md`. Demo mode (default) simulates Connect onboarding and transfers and writes the same ledger rows.
- **No holds anywhere.** Automatic capture at checkout (no authorization holds or deposits), no card on file for runners, and runners are paid the moment the PIN is entered (a per-delivery Transfer with `source_transaction`, so it never waits on our balance). Failed transfers are retried every 15 minutes. The old 24-hour payout hold, minimum payout and payout email were removed (UI, API, schema, tests).
- **Late delivery:** the delivery fee is refunded automatically; the runner keeps only the tip and gets a strike. Platform takes no fee on that order.
- **Customer cancel after claim:** refund minus the runner's $0.50, which goes to the runner. Admin cancels refund everything and pay no runner fee. "Already refunded" counts cash refunds plus any credit issued on the order (a test caught a double count after a lobby floor-fee refund).
- **Delivery guarantee ($0.10, configurable)** is its own line, never surged, never paid with credit, and goes to the Guarantee Fund (`guarantee_in`). Lost-food cash refunds are booked out of the fund (`guarantee_out`); if the fund can't cover one, the gap is booked as `fund_shortfall` and covered by platform revenue, so customers are never refunded less. Cancelled orders return the guarantee (a negative `guarantee_in`).
- **Lost-food refund policy:** fee + tip + guarantee back the way they were paid (card to card, credit to credit), and the entered food value as Dormdash credit (capped at the receipt total the customer typed). Never on customer no-shows.
- **Dormdash credit** pays delivery fees and tips only, is applied automatically (customers can switch it off per order or in Profile), is redeemed when the order is created and restored if it's cancelled, has no cash value and never expires. It never reduces runner pay: the runner's share is computed on the full fee.
- **Order size and bags:** size add-on tiers by food total ($0 up to $15, +$0.50 up to $30, +$1 up to $50, +$1.50 above). Bags: +$0.50 per bag after the first, max 4, added *after* busy pricing so surge doesn't multiply a flat handling fee.
- **Lobby handoff floor-fee refund:** whether the handoff is at the door or in the lobby isn't known until a runner claims (resident or not), so customers pay the floor add-on at checkout and it's refunded automatically the moment a non-resident runner claims (card first, then credit). The checkout says so up front. A repriced order can't simply be dropped by the runner (they report a problem instead), so the refund can't be gamed.

## Product rules (all admin-configurable unless noted)

- **"Weeknights" = Sunday through Thursday nights, 9pm to 1am. "Weekend nights" = Friday and Saturday, 8pm to 2am.** A window that crosses midnight belongs to the day it starts on. Weather surge is a manual toggle (default 1.5x). If several apply, the highest multiplier wins. Surge multiplies the delivery fee, never the tip. Scheduled orders are priced for their delivery time.
- **Repeated drops:** the first drop (unclaim) in a rolling 7 days is free; each one after that is a strike.
- **Strikes** count while not voided. At 3 the runner is auto-suspended and taken off shift. Admin "Reinstate" clears strikes.
- **Unclaimed orders:** at 10 minutes runners get re-pinged; at 20 minutes the customer is told they can cancel for a full refund (cancelling before claim is always free anyway). Scheduled orders start this clock 30 minutes before their time and appear on the board 45 minutes before.
- **ETA** = walk to spot and back at 3 mph + 4 min pickup wait + elevator time by floor + 3 min per extra order on the run, minimum 8 minutes; for scheduled orders, never earlier than the scheduled time.
- **Runs (replace batches):** a run is the runner's open trip (`runs` table, renamed from `batches`). Suggested runs are one per destination building, grouped by pickup spot then floor, capped by remaining capacity and the food-value cap, and taken with one tap (all or nothing). Picking individual orders with checkboxes joins the same run. Stops show pickups first, then deliveries by floor (elevator order); countdowns for every stop run in parallel.
- **Heading home:** one location check when the runner taps "I'm heading to my building"; pickups within 0.15 mi going to that building are shown. Sessions are logged (result only, never coordinates) for the admin metrics.
- **Lobby handoff:** if the building requires a resident card and the runner's home building (from their approved application) isn't it. Customers are told before paying, including how many resident runners are on shift.
- **Food for PIN, no exceptions.** The PIN entered by the runner is the only way an order completes. Door/desk drop-offs, "leave at door", door-photo delivery and the old drop-off photo path were removed (UI, API, schema check `delivered_via = 'pin'`, tests). The PIN lives in a separate table only the customer and admins can read; 5 wrong PINs lock entry (call the customer or wait out the countdown).
- **Heads-up:** sent automatically when the last pickup of a run is done, or when the runner taps "Heading to the building". Copy differs for lobby handoffs.
- **At the door:** "At your door" / "In the lobby" requires a live photo of the bag with the room number or door sign in frame; a one-time location check against the building's handoff radius (default 75 m, editable per building) is stamped on it; the customer sees the photo and a 3-minute countdown.
- **Customer not here** unlocks only when the door photo exists, the countdown is over, the runner called at least once through the app, and the customer hasn't tapped "I'm at my door". The runner gets the full fee + tip; the customer gets no refund. If the location wasn't verified (out of range / denied / unavailable), the payout is held for admin review instead of being refused, because GPS indoors is unreliable.
- **"I'm at my door and the runner isn't here"** is visible from the door photo until 5 minutes after the countdown. It blocks "Customer not here" and, if no PIN follows within 3 minutes, opens a runner-not-at-door case (cron + page sweeps).
- **Missing delivery:** picked up but never at the door 45 minutes after pickup: the customer gets a "My food never arrived" button (priority-2 case).
- **PIN given, no food:** available for 5 minutes after the PIN; opens a priority-1 case with a pending incident on both parties until an admin decides. Every other theft/never-received claim on a PIN-completed order is auto-rejected with an explanation (the PIN is proof of handoff) and counts as a rejected claim.
- **Runner problem reports** (restaurant not ready, wrong order, spilled, can't get in) need a note and a live photo, end the order, and are treated as accidents: the customer gets the lost-food refund. The first in 30 days carries no penalty; later ones are incidents.
- **Calls:** in-app call buttons only during an active order; numbers are fetched on tap and never rendered as text; every tap is logged (`call_logs`).
- **Runner levels:** $20 of food per order for 0-9 deliveries, $40 for 10-29, no limit from 30; total active food capped at 2x the per-order limit. An upheld case drops the runner one level via `profiles.level_offset` (deliveries minus offset), which keeps the real delivery count honest. Tiers are editable.
- **Abuse patterns:** customers: 2 no-shows in 30 days = warning, 3+ = ordering paused until admin review. Anyone with incidents involving 3+ different counterparties in 60 days is flagged (customers can't order, runners can't run). Runners marking "Customer not here" on more than 20% of their last 10+ finished orders are flagged.
- **Cases:** priority 1 (PIN, no food), 2 (missing / runner not at door), 3 (claims, problem reports). Runners get 24 hours to respond; the refund target is 24 hours (shown as a clock in the admin queue). All communication is admin-mediated in separate per-party threads; neither party ever sees the other's last name, phone, email, NYU ID or location data.
- **Confirmed theft** is one admin action: lost-food refund, unpaid earnings deducted into the fund, runner dropped a level, permanently banned, and their email, phone and NYU ID blocked from signup and runner applications. Banned runners land on `/appeal` and can appeal once within 7 days; overturning restores the account and unblocks the identities. The appeal decision is final.
- **Law enforcement** requests are logged by admins (agency, officer, reference, date, exactly what was shared). There's no self-serve export.
- **No runners on shift:** ASAP ordering is blocked with the next covered window; scheduling is limited to 15-minute slots inside hours where runners are scheduled (up to 3 days out).
- **Customers can have 3 active orders.** Order creation is rate-limited (8 per 10 minutes).
- **Customer problem reports** (wrong or missing items, something else) open a priority-3 case, one open case of each type per order; theft or never-received on PIN-completed orders are auto-rejected (see above).
- **Dining halls** exist but are off via the `dining_halls_enabled` flag.
- **Max radius 0.25 mi.** A spot/building pair beyond the radius can't be switched on; changing the radius re-applies it to every pair.

## Data, privacy, storage

- **Evidence photos come only from the live camera.** The in-app camera (getUserMedia, rear camera, no file input) requests a single-use, 3-minute camera token when it opens; the upload must carry that token, be a JPEG and contain no EXIF block (canvas captures never do; phone gallery photos almost always do). This is best effort, not tamper-proof: someone with dev tools could forge a capture, which is why admins weigh evidence alongside the location stamp, timestamps, call log and PIN log. The general upload route refuses evidence kinds outright. If camera permission is denied, the step can't continue and the UI explains how to allow it.
- **Location is one-time and minimal:** checked only when heading home, taking an evidence photo, and arriving at the door. Coordinates are never stored; only the result (in range / out of range / denied / unavailable) and a rounded distance.
- **Evidence retention:** evidence photos are deleted 90 days after an order closes unless a case on it is still open (daily cron).
- **Storage buckets:** `avatars` (public), `id-photos` and `order-photos` (private, short-lived signed URLs). All uploads go through the server, which checks type by magic bytes (JPEG/PNG/WebP) and size (4 MB). Browsers downscale photos before upload to stay under Vercel's 4.5 MB body limit.
- **Runner rating** is exposed to customers only as an aggregate through security-definer functions; individual ratings stay private.
- **Placeholder seed data:** building names, addresses and coordinates are placeholders, and spot names are generic on purpose (Dormdash has no restaurant partnerships). All spots are flagged "verify before launch".
- **"Not affiliated with NYU"** is stated in the footer and Terms. NYU violet isn't used anywhere.

## Background jobs

- **Vercel Cron** runs `/api/cron/unclaimed`, `/api/cron/late`, `/api/cron/surge` and `/api/cron/handoff` (runner-absent and missing-delivery cases) every minute, `/api/cron/payouts` (transfer retries) every 15 minutes and `/api/cron/retention` (evidence deletion) daily. Time-based handoff rules are also evaluated when the relevant pages load. **Every-minute crons need a Vercel Pro plan**; on Hobby, use an external pinger (e.g. cron-job.org) hitting the same URLs with the `Authorization: Bearer $CRON_SECRET` header.

## Notifications and email

- Every notification is stored in-app; push and email follow the user's per-category preferences. Runner approval/rejection, case outcome and appeal emails always send (account-critical). Auth emails (verify, reset, email change) are Supabase's own emails using our templates. Transactional emails go through Resend when `RESEND_API_KEY` is set, and are logged otherwise.
- **Push** uses standard Web Push (VAPID). On iPhone it works only after "Add to Home Screen" (iOS 16.4+); the settings screen says so.

## Design

- One accent, **mustard** (`#EFB21C`, cab yellow / deli mustard). Display face **Big Shoulders**, text face **IBM Plex Sans**. Full system in `DESIGN.md`; audit in `DESIGN_AUDIT.md`.
- **Rename to Dormdash** with a two-tone wordmark (DORM in ink, DASH in the accent ink). The accent stayed mustard rather than going red, to keep distance from DoorDash's red. **Trademark risk:** "Dormdash" is close to DoorDash, a registered mark for the same kind of service; get a clearance search and a lawyer's opinion before launch. The footer and Terms state Dormdash is not affiliated with DoorDash or NYU.
- **Run screen** is a single checklist (pickups, then floors) with big touch targets, the room number as the heading of each delivery stop, the PIN pad inline, and a dark "Waiting on PINs" strip showing every countdown at once.

## Testing

- Unit tests (Vitest) for pricing (size, bags, guarantee, credit), distance, time zones, the order state machine, cancellations, lateness, strikes, runs, levels, handoff timers and no-show rules, lost-order refunds, the Guarantee Fund split and abuse patterns. Playwright uses Chromium's fake camera and a mocked GPS for the live-camera flows. Integration tests run the real route handlers against a real in-memory Postgres with the real migrations and RLS. Playwright runs the full browser flow against a production build with its own database.
- No CI workflows, per instructions. Run `npm run test:all` locally.

## Not built (yet)

- SMS phone verification; masked phone numbers (calls dial the real number via `tel:`, fetched on tap and never displayed; a Twilio proxy number would hide it entirely); multi-campus support; maps.

## Dev server and local mode

- **Root cause of `npm run dev` crashing:** Turbopack spawned a worker to run the `@tailwindcss/turbopack` CSS loader on `globals.css`, and on this Windows machine that worker died at process start with `0xc0000142` (STATUS_DLL_INIT_FAILED), which panicked the whole dev server (see the Next panic log in `%TEMP%`). Fix: removed the custom Turbopack CSS rule and that package and switched to the standard `@tailwindcss/postcss` pipeline (`postcss.config.mjs`), which Turbopack runs in-process.
- **Fallback:** `npm run dev` goes through `scripts/dev.mjs`, which starts Turbopack and, if it ever hits that same worker panic, restarts automatically with `--webpack`. `npm run dev:webpack` forces webpack.
- **PGlite deadlock found by tests:** a query issued outside an open transaction waits forever on PGlite's single connection. `runnerGate` now runs inside the claim transaction. Real Postgres wouldn't deadlock, but local mode must not either.
