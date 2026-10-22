import "server-only";
import { q, q1, tx } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { sendEmail, templates } from "@/lib/email";
import { notify, notifyAdmins } from "@/lib/notify";
import { takePhoto } from "./photos";

export type Application = {
  id: string;
  user_id: string;
  legal_name: string;
  home_building_id: string;
  id_photo_path: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
};

export async function latestApplication(userId: string) {
  return q1<Application>("select * from public.runner_applications where user_id = $1 order by created_at desc limit 1", [userId]);
}

export async function applyToRun(userId: string, input: { legalName: string; homeBuildingId: string; idPhotoId: string; nyuIdNumber: string }) {
  const blocked = await q1("select 1 from public.blocked_identities where kind = 'nyu_id' and value = lower($1)", [input.nyuIdNumber]);
  if (blocked) throw new ApiError(403, "blocked", "This NYU ID can't be used to run on Dormdash.");
  await tx(async (t) => {
    const [p] = await t.query<{ runner_status: string }>("select runner_status from public.profiles where id = $1 for update", [userId]);
    if (p.runner_status === "approved") throw new ApiError(409, "already_runner", "You're already a runner.");
    if (p.runner_status === "pending") throw new ApiError(409, "pending", "Your application is already in. We'll email you.");
    if (p.runner_status === "suspended") throw new ApiError(403, "suspended", "Your runner account is under review. Email support.");
    const [b] = await t.query("select 1 from public.buildings where id = $1 and active", [input.homeBuildingId]);
    if (!b) throw new ApiError(400, "bad_building", "Pick the building you live in.");
    const photo = await takePhoto(t, input.idPhotoId, userId, "id_card");
    await t.query(
      `insert into public.runner_applications (user_id, legal_name, home_building_id, id_photo_path, agreement_accepted_at, nyu_id_number)
       values ($1, $2, $3, $4, now(), upper($5))`,
      [userId, input.legalName, input.homeBuildingId, photo.path, input.nyuIdNumber],
    );
    await t.query("update public.profiles set runner_status = 'pending' where id = $1", [userId]);
  });
  await notifyAdmins({ title: "New runner application", body: `${input.legalName} applied to run.`, url: "/admin/runners" });
}

export async function decideApplication(adminId: string, applicationId: string, approve: boolean, note: string | null) {
  const app = await tx(async (t) => {
    const [a] = await t.query<Application>("select * from public.runner_applications where id = $1 for update", [applicationId]);
    if (!a) throw new ApiError(404, "not_found", "Application not found.");
    if (a.status !== "pending") throw new ApiError(409, "decided", "Someone already decided this one.");
    await t.query(
      "update public.runner_applications set status = $2, admin_note = $3, reviewed_by = $4, reviewed_at = now() where id = $1",
      [a.id, approve ? "approved" : "rejected", note, adminId],
    );
    await t.query(
      "update public.profiles set runner_status = $2, runner_home_building_id = case when $3 then $4::uuid else runner_home_building_id end where id = $1",
      [a.user_id, approve ? "approved" : "rejected", approve, a.home_building_id],
    );
    return a;
  });
  const p = await q1<{ email: string | null }>("select email from public.profiles where id = $1", [app.user_id]);
  await notify(app.user_id, {
    category: "account",
    title: approve ? "You're approved to run" : "Runner application update",
    body: approve ? "Set up payouts (bank + identity), pick shifts, and go on shift." : note ?? "We couldn't approve your application right now.",
    url: "/run",
    email: null,
  });
  // Approval emails always go out (they're account-critical), regardless of prefs.
  if (p?.email) await sendEmail({ to: p.email, ...templates.runnerDecision(approve, note) });
}

export async function setOnShift(runnerId: string, on: boolean) {
  if (!on) {
    await q("update public.profiles set on_shift = false, on_shift_since = null where id = $1", [runnerId]);
    return;
  }
  await q("update public.profiles set on_shift = true, on_shift_since = coalesce(on_shift_since, now()) where id = $1 and runner_status = 'approved'", [runnerId]);
}

export async function saveShifts(runnerId: string, slots: { day: number; hour: number }[]) {
  await tx(async (t) => {
    await t.query("delete from public.shifts where runner_id = $1", [runnerId]);
    for (const s of slots) {
      await t.query("insert into public.shifts (runner_id, day_of_week, start_hour) values ($1, $2, $3) on conflict do nothing", [runnerId, s.day, s.hour]);
    }
  });
}

export async function myShifts(runnerId: string) {
  return q<{ day_of_week: number; start_hour: number }>("select day_of_week, start_hour from public.shifts where runner_id = $1", [runnerId]);
}

export type EarningsSummary = {
  todayCents: number;
  weekCents: number;
  tipsWeekCents: number;
  pendingCents: number;
  availableCents: number;
  lifetimeCents: number;
  deliveriesWeek: number;
  rating: number | null;
  ratings: number;
  activeStrikes: number;
};

export async function earningsSummary(runnerId: string): Promise<EarningsSummary> {
  // Start of today and of this week (Monday) in New York, computed in SQL for DST safety.
  const row = await q1<EarningsSummary>(
    `with bounds as (
       select (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York') as day_start,
              (date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York') as week_start
     )
     select
       coalesce(sum(e.amount_cents) filter (where e.created_at >= bounds.day_start), 0)::int as "todayCents",
       coalesce(sum(e.amount_cents) filter (where e.created_at >= bounds.week_start), 0)::int as "weekCents",
       coalesce(sum(e.amount_cents) filter (where e.created_at >= bounds.week_start and e.kind = 'tip'), 0)::int as "tipsWeekCents",
       coalesce(sum(e.amount_cents) filter (where e.payout_id is null and e.held), 0)::int as "pendingCents",
       coalesce(sum(e.amount_cents) filter (where e.payout_id is null and not e.held), 0)::int as "availableCents",
       coalesce(sum(e.amount_cents), 0)::int as "lifetimeCents",
       (select count(*)::int from public.orders o, bounds b2 where o.runner_id = $1 and o.status = 'delivered' and o.delivered_at >= b2.week_start) as "deliveriesWeek",
       (select avg(stars)::float8 from public.ratings where runner_id = $1) as rating,
       (select count(*)::int from public.ratings where runner_id = $1) as ratings,
       (select count(*)::int from public.strikes where runner_id = $1 and not voided) as "activeStrikes"
     from bounds left join public.runner_earnings e on e.runner_id = $1
     group by bounds.day_start, bounds.week_start`,
    [runnerId],
  );
  return row!;
}

export async function earningLines(runnerId: string, limit = 50) {
  return q<{ id: string; order_id: string | null; code: string | null; kind: string; amount_cents: number; created_at: Date; held: boolean; payout_id: string | null; memo: string }>(
    `select e.id, e.order_id, o.code, e.kind, e.amount_cents, e.created_at, e.held, e.payout_id, e.memo
     from public.runner_earnings e left join public.orders o on o.id = e.order_id
     where e.runner_id = $1 order by e.created_at desc limit $2`,
    [runnerId, limit],
  );
}

export async function payoutHistory(runnerId: string) {
  return q<{ id: string; amount_cents: number; status: string; provider: string; receiver: string | null; created_at: Date; paid_at: Date | null; error: string | null }>(
    "select id, amount_cents, status, provider, receiver, created_at, paid_at, error from public.payouts where runner_id = $1 order by created_at desc limit 50",
    [runnerId],
  );
}

// ---------------------------------------------------------------------------
// Payouts setup: Stripe Connect Express (bank + identity). Demo mode simulates it.
// ---------------------------------------------------------------------------

export async function startPayoutSetup(userId: string, email: string) {
  const { getPayments } = await import("@/lib/payments");
  const { env } = await import("@/lib/env");
  const provider = getPayments();
  const p = await q1<{ stripe_account_id: string | null }>("select stripe_account_id from public.profiles where id = $1", [userId]);
  let accountId = p?.stripe_account_id ?? null;
  if (!accountId) {
    accountId = (await provider.createConnectAccount(email)).accountId;
    await q("update public.profiles set stripe_account_id = $2 where id = $1", [userId, accountId]);
  }
  const { url } = await provider.onboardingLink(accountId, `${env.siteUrl}/run/earnings?payouts=return`, `${env.siteUrl}/run/earnings?payouts=refresh`);
  return { url };
}

/** Re-check the connected account (on return from onboarding, and from the webhook). */
export async function syncPayoutStatus(userId: string) {
  const { getPayments } = await import("@/lib/payments");
  const p = await q1<{ stripe_account_id: string | null }>("select stripe_account_id from public.profiles where id = $1", [userId]);
  if (!p?.stripe_account_id) return { payoutsEnabled: false };
  const st = await getPayments().accountStatus(p.stripe_account_id);
  await q("update public.profiles set payouts_enabled = $2 where id = $1", [userId, st.payoutsEnabled && st.detailsSubmitted]);
  return { payoutsEnabled: st.payoutsEnabled && st.detailsSubmitted };
}
