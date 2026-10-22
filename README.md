# FloorDrop

Food from spots near your NYU dorm, brought up to your floor by another student.
Customers order pickup themselves (in the restaurant's own app) and pay FloorDrop
only a small delivery fee plus an optional tip. Verified NYU students ("runners")
grab the bag and bring it upstairs.

- Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · installable PWA
- Supabase (Postgres + Auth + Storage + Realtime) with RLS on every table
- PayPal (Checkout + Payouts) with a full demo-payments mode
- Vitest + Playwright

Docs: [DESIGN.md](DESIGN.md) (design system) · [DESIGN_AUDIT.md](DESIGN_AUDIT.md) ·
[PAYMENTS.md](PAYMENTS.md) · [DECISIONS.md](DECISIONS.md) · screenshots in
[docs/screenshots](docs/screenshots).

---

## Run it locally (no accounts needed)

Requires Node 20+ (tested on Node 24).

```bash
npm install
npm run db:seed        # creates a local Postgres (PGlite) in .data/ and fills it with demo data
npm run dev            # http://localhost:3000
```

With no environment variables, everything runs locally: an in-process Postgres with
the real migrations and RLS, local auth, local photo storage, demo payments, and a
**dev outbox** at [/dev/outbox](http://localhost:3000/dev/outbox) where every email
(verification links, password resets) lands so you can click it.

Start over with a fresh database: `npm run db:reset`.

### Demo logins

Every demo account uses the password **`FloorDrop123`**.

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@nyu.edu` | Full admin dashboard |
| Runner | `runner1@nyu.edu` | Maya, lives in Tower Hall, **on shift**, 2 active jobs |
| Runner | `runner2@nyu.edu` | Diego, Tower Hall, off shift |
| Runner | `runner3@nyu.edu` | Priya, Mercer House, **on shift**, 1 active job |
| Runner | `runner4@nyu.edu` | Sam, Mercer House, off shift |
| Pending runner | `pending@nyu.edu` | Application waiting for admin approval |
| Customer | `customer1@nyu.edu` | Jordan, Tower Hall floor 14, live order + history + 1 open dispute |
| Customer | `customer2@nyu.edu` … `customer6@nyu.edu` | Orders in every status across both buildings |

Seeded: 2 placeholder buildings (16 and 8 floors), 11 placeholder pickup spots
around Washington Square (one is a dining hall, hidden by the default feature flag),
about four weeks of order history for the KPIs, live orders in every status, shifts,
payouts, and one open dispute.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (Vitest, real Postgres in memory) |
| `npm run test:e2e` | Playwright end-to-end (builds and boots its own isolated copy on port 3200) |
| `npm run test:all` | All of the above |
| `npm run screenshots` | Captures every major page × role × 390/1280 × light/dark into `docs/screenshots` |
| `npm run db:migrate` | Applies `supabase/migrations/*.sql` to `DATABASE_URL` (no-op locally) |
| `npm run db:seed` | Demo data (`-- --places-only` for just buildings + spots) |
| `npm run db:reset` | Delete the local database and re-seed |
| `npm run vapid` | Generate web-push keys |

---

## Go live

You'll create three accounts (Supabase, Vercel, PayPal) plus optionally Resend for
email. Budget about an hour, plus a few days for PayPal to approve Payouts.

### 1. Supabase (database, auth, storage, realtime)

1. Create a project at [supabase.com](https://supabase.com) (region: `us-east-1`, close to NYC).
2. **Run the migrations.** Either:
   - **SQL editor:** paste and run each file in `supabase/migrations/` in order (`0001` → `0004`), or
   - **From your machine:** put the *Session pooler* (port 5432) connection string in `.env.local` as `DATABASE_URL`, then `npm run db:migrate`.
3. **Storage:** migration `0002` creates the `avatars` (public), `id-photos` and `order-photos` (private) buckets. Check they exist under Storage.
4. **Auth settings** (Authentication → Sign In / Providers):
   - Email provider **on**, **Confirm email on**. Turn every other provider **off** (no Google/Apple/magic links).
   - Minimum password length 8.
5. **URL configuration** (Authentication → URL Configuration):
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URLs: `https://YOUR-DOMAIN/**` (and your `*.vercel.app` preview URL if you use previews).
6. **Email templates** (Authentication → Emails → Templates). Paste the HTML from `supabase/templates/`:
   - *Confirm signup* ← `confirm-signup.html` (subject: "Confirm your FloorDrop email")
   - *Reset password* ← `reset-password.html` (subject: "Reset your FloorDrop password")
   - *Change email address* ← `change-email.html` (subject: "Confirm your new FloorDrop email")

   These links go to `/auth/confirm?token_hash=…`, which is what the app expects. The default Supabase templates **won't work**.
7. **SMTP:** Supabase's built-in email is rate-limited (a few per hour) and meant for testing. Before real users, set custom SMTP (Authentication → Emails → SMTP), e.g. with Resend (`smtp.resend.com`, user `resend`, password = your Resend API key).
8. **Keys** (Project Settings → API): copy the project URL, the anon/publishable key, and the service_role/secret key. **Connection string** (Connect button → *Transaction pooler*, port 6543): copy it for `DATABASE_URL`.

### 2. Vercel (hosting)

1. Import this GitHub repo at [vercel.com/new](https://vercel.com/new). Framework: Next.js (auto-detected). No build settings to change.
2. **Environment variables** (Settings → Environment Variables), for Production (and Preview if you want):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://YOUR-DOMAIN` |
| `APP_SECRET` | output of `openssl rand -base64 32` |
| `CRON_SECRET` | another random string |
| `ADMIN_EMAILS` | your NYU email (comma-separate several) |
| `ALLOWED_EMAIL_DOMAINS` | `nyu.edu` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role / secret key (**never** a `NEXT_PUBLIC_` var) |
| `DATABASE_URL` | Supabase transaction pooler string (port 6543) |
| `PAYMENTS_PROVIDER` | `demo` to start; `paypal` once step 4 is done |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, for transactional email (step 5) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | from `npm run vapid`, for push notifications |

   All variables are documented in [`.env.example`](.env.example).
3. Deploy. **Crons:** `vercel.json` schedules four cron jobs. The every-minute ones (unclaimed pings, late refunds, surge) need the **Vercel Pro** plan. On Hobby, point a free external scheduler (e.g. cron-job.org) at `https://YOUR-DOMAIN/api/cron/unclaimed`, `/api/cron/late`, `/api/cron/surge` every minute and `/api/cron/payouts` daily, each with the header `Authorization: Bearer YOUR_CRON_SECRET`.

### 3. Become admin, add real places

1. Sign up on the live site with an email listed in `ADMIN_EMAILS` and verify it. You're admin.
   - Alternative, in the Supabase SQL editor: `update public.profiles set is_admin = true where email = 'you@nyu.edu';`
2. Load the placeholder buildings and spots (optional starting point): with the production `DATABASE_URL` and Supabase keys in `.env.local`, run `npm run db:seed -- --places-only`. **Don't run the full demo seed in production** (it creates fake users).
3. In **Admin → Places**, replace the placeholders with your real dorms (name, address, exact lat/lng, floor count, whether a resident card is needed) and **verify every pickup spot**: walk there, confirm the pickup counter, fix the lat/lng (right-click the door in any map app to copy coordinates), add pickup notes, and untick "verify before launch". Distances and the 0.25 mi radius are recalculated automatically.
4. Review **Admin → Pricing** (fees, surge windows, rules) and **Admin → Flags**.

### 4. Payments (PayPal)

Follow the checklist in [PAYMENTS.md](PAYMENTS.md): business account → app credentials →
enable Payouts → webhook → test in **sandbox** → switch to **live**
(`PAYPAL_ENV=live` + live credentials) → redeploy. Until then, the app runs in clearly
labeled demo-payments mode.

### 5. Email for app notifications (optional but recommended)

Create a [Resend](https://resend.com) account, verify your domain, set `RESEND_API_KEY` and
`EMAIL_FROM` (e.g. `FloorDrop <hello@yourdomain.com>`). Without it, runner-approval and
dispute-outcome emails are only logged (in-app and push notifications still work).

### 6. Domain

Buy a domain (Vercel → Domains, or any registrar), add it to the Vercel project, and
follow Vercel's DNS instructions. Then update `NEXT_PUBLIC_SITE_URL` in Vercel, the Site
URL and Redirect URLs in Supabase, and the PayPal webhook URL to the new domain.
Redeploy.

### 7. Before you announce it

- [ ] Legal pages reviewed by a lawyer (search for `[LAWYER REVIEW NEEDED]`).
- [ ] Every pickup spot and building verified in person; placeholders gone.
- [ ] PayPal live, one real $1 order placed and refunded.
- [ ] A couple of real runners approved, with shifts set (customers see "nobody's running" otherwise).
- [ ] Custom SMTP set in Supabase.
- [ ] Crons firing (Admin dashboard: "busy pricing" switches on at 9pm; check Vercel → Crons logs).

---

## How it's built

```
src/
  app/                    routes (App Router)
    (auth)/               login, signup, forgot/reset password, verify email
    (app)/                signed-in app: home, order, orders, run, profile, notifications, admin
    api/                  route handlers (auth, orders, runner, admin, cron, webhooks, uploads)
    auth/confirm          landing for every emailed auth link
  components/             UI kit (ui/), brand marks, order status, job board, charts
  lib/
    domain/               pure logic: pricing, geo, NY time, order state machine, strikes, batching
    services/             business operations (orders, runners, disputes, payouts, cron, KPIs)
    auth/                 Supabase Auth + local mirror, session guards
    db/                   Postgres (prod) / PGlite (local) behind one interface; asUser() for RLS
    payments/             PayPal + demo providers
  proxy.ts                route protection (Next 16's name for middleware)
supabase/migrations/      schema, RLS, defaults
supabase/templates/       auth email templates
scripts/                  seed, migrate, icons, e2e server
tests/                    Vitest unit + integration
e2e/                      Playwright
```
