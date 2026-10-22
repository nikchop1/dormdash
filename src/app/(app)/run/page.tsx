import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, CircleAlert, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { paymentsMode } from "@/lib/env";
import { haversineMiles } from "@/lib/domain/geo";
import { STATUS_LABEL } from "@/lib/domain/orders";
import { suggestBatches } from "@/lib/domain/runners";
import { fmtTime, nowMs } from "@/lib/domain/time";
import { latestApplication, myShifts, earningsSummary } from "@/lib/services/runners";
import { openJobs, runnerActiveJobs } from "@/lib/services/orders";
import { getCurrentSurge, getPricing } from "@/lib/settings";
import { ElevatorMark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, FloorBadge, Money, Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import type { BoardJob } from "@/components/job-board";
import { RunnerBoard, ShiftToggle } from "./runner-board";

export const metadata: Metadata = { title: "Run" };

function Pitch() {
  return (
    <div className="mt-2 flex flex-col gap-6">
      <p className="text-body-lg text-ink-2">
        You&rsquo;re already walking past these places. Grab a bag on the way back, ride the elevator, get paid. Pick your own hours.
      </p>
      <dl className="divide-y divide-line border-y border-line">
        {[
          ["75%", "of every delivery fee, plus 100% of tips"],
          ["4 max", "orders at once, batched by building and floor"],
          ["Daily", "payouts to PayPal once the 24-hour dispute window passes"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-4 py-3">
            <dt className="tnum w-20 shrink-0 font-display text-title font-extrabold">{k}</dt>
            <dd className="text-small text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
      <ButtonLink href="/run/apply" size="lg" className="self-start">Apply to run</ButtonLink>
      <p className="text-small text-ink-3">You&rsquo;ll need a photo of your NYU ID. Read the <Link href="/legal/runner-agreement" className="link">Runner Agreement</Link> first.</p>
    </div>
  );
}

export default async function RunPage() {
  const user = await requireUser();
  const p = user.profile;

  if (p.runner_status !== "approved") {
    const app = await latestApplication(user.id);
    return (
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <PageHeader overline="Run" title={p.runner_status === "none" ? "Get paid to take the elevator" : "Runner status"} />
        {p.runner_status === "none" && <Pitch />}
        {p.runner_status === "pending" && (
          <Notice tone="warning" title="Application in review">
            We usually decide within a day. You&rsquo;ll get an email and a notification either way.
            {app && <span className="tnum block">Sent {fmtTime(app.created_at)}.</span>}
          </Notice>
        )}
        {p.runner_status === "rejected" && (
          <div className="flex flex-col gap-6">
            <Notice tone="info" title="Not approved this time">{app?.admin_note ?? "We couldn't approve your application."} You can apply again.</Notice>
            <ButtonLink href="/run/apply" variant="secondary" className="self-start">Apply again</ButtonLink>
          </div>
        )}
        {p.runner_status === "suspended" && (
          <div className="flex flex-col gap-6">
            <Notice tone="danger" icon={<CircleAlert />} title="Running is paused">
              Your account hit the strike limit or was paused by an admin. We&rsquo;ll review it and email you. Existing earnings still pay out.
            </Notice>
            <ButtonLink href="/run/earnings" variant="secondary" className="self-start">See earnings</ButtonLink>
          </div>
        )}
      </div>
    );
  }

  const [settings, active, shifts, summary, surge] = await Promise.all([
    getPricing(),
    runnerActiveJobs(user.id),
    myShifts(user.id),
    earningsSummary(user.id),
    getCurrentSurge(),
  ]);
  const jobs = p.on_shift ? await openJobs() : [];
  const now = nowMs();
  const toBoard = (j: (typeof jobs)[number]): BoardJob => ({
    id: j.id,
    spotName: j.spot_name,
    buildingShort: j.building_short,
    floor: j.floor,
    distanceMiles: Number(j.distance_miles),
    payCents: j.runner_fee_cents + j.tip_cents,
    tipCents: j.tip_cents,
    waitedMin: Math.max(0, Math.floor((now - j.created_at.getTime()) / 60000)),
    scheduledLabel: j.scheduled_for ? fmtTime(j.scheduled_for) : null,
    surge: j.surge_multiplier > 1,
  });
  const ownable = jobs.filter((j) => j.customer_id !== user.id);
  const capacity = Math.max(0, settings.maxActiveOrders - active.length);
  const batches = suggestBatches(
    ownable.map((j) => ({ ...j, id: j.id, spotId: j.spot_id, spotLat: j.spot_lat, spotLng: j.spot_lng, buildingId: j.building_id, floor: j.floor, createdAt: j.created_at })),
    capacity,
    haversineMiles,
  ).map((b) => ({ key: b.key, buildingShort: b.jobs[0].building_short, jobs: b.jobs.map(toBoard) }));
  const needsPayout = paymentsMode === "paypal" && !p.payout_email;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader overline={`Hey ${p.full_name.split(" ")[0]}`} title="Run" />
      <ShiftToggle on={p.on_shift} disabled={needsPayout} />

      <div className="tnum mt-4 grid grid-cols-3 divide-x divide-line border-y border-line text-center">
        <Link href="/run/earnings" className="py-3 hover:bg-sunken/60">
          <span className="block text-caption text-ink-3">Today</span>
          <Money cents={summary.todayCents} className="font-display text-heading font-extrabold" />
        </Link>
        <Link href="/run/earnings" className="py-3 hover:bg-sunken/60">
          <span className="block text-caption text-ink-3">This week</span>
          <Money cents={summary.weekCents} className="font-display text-heading font-extrabold" />
        </Link>
        <Link href="/profile/ratings" className="py-3 hover:bg-sunken/60">
          <span className="block text-caption text-ink-3">Rating</span>
          <span className="font-display text-heading font-extrabold">{summary.rating ? summary.rating.toFixed(1) : "New"}</span>
        </Link>
      </div>

      {(needsPayout || shifts.length === 0 || summary.activeStrikes > 0) && (
        <div className="mt-4 flex flex-col gap-2">
          {needsPayout && (
            <Notice tone="warning" icon={<Wallet />} title="Add your PayPal email" action={<ButtonLink href="/run/earnings" size="sm" variant="ink">Add</ButtonLink>}>
              We pay out to PayPal. You can&rsquo;t go on shift until it&rsquo;s set.
            </Notice>
          )}
          {shifts.length === 0 && (
            <Notice tone="info" icon={<CalendarDays />} title="Pick your usual hours" action={<ButtonLink href="/run/shifts" size="sm" variant="secondary">Shifts</ButtonLink>}>
              Customers see when runners are around, so set the hours you&rsquo;re usually free.
            </Notice>
          )}
          {summary.activeStrikes > 0 && (
            <Notice tone="danger" icon={<CircleAlert />} title={`${summary.activeStrikes} of ${settings.strikeThreshold} strikes`}>
              At {settings.strikeThreshold}, running pauses until an admin reviews it. Late deliveries, upheld reports and repeat unclaims count.
            </Notice>
          )}
        </div>
      )}

      {active.length > 0 && (
        <section className="mt-8">
          <SectionTitle action={<span className="tnum text-small text-ink-3">{active.length} of {settings.maxActiveOrders}</span>}>Your jobs</SectionTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {active.map((o) => (
              <li key={o.id}>
                <Link href={`/run/jobs/${o.id}`} className="flex items-center gap-4 rounded-md border border-line-strong bg-surface p-4 transition-colors hover:bg-sunken/50">
                  <FloorBadge floor={o.floor} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption font-semibold tracking-wide text-accent-ink uppercase">{STATUS_LABEL[o.status]}{o.handoff === "lobby" ? " · lobby" : ""}</span>
                    <span className="block truncate font-semibold">{o.spot_name}</span>
                    <span className="tnum block text-small text-ink-2">{o.building_short} {o.room} · due {o.eta ? fmtTime(o.eta) : "soon"}</span>
                  </span>
                  <ChevronRight className="size-5 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle action={p.on_shift ? <span className="tnum text-small text-ink-3">{ownable.length} open</span> : undefined}>Job board</SectionTitle>
        {!p.on_shift ? (
          <EmptyState title="Board's hidden" mark={<ElevatorMark />}>Go on shift to see open jobs. We&rsquo;ll only ping you while you&rsquo;re on.</EmptyState>
        ) : ownable.length === 0 ? (
          <EmptyState title="Board's quiet" mark={<ElevatorMark />}>Stay on shift and we&rsquo;ll ping you the second something drops.{surge ? " Busy pricing is on, so it won't be quiet for long." : ""}</EmptyState>
        ) : (
          <RunnerBoard jobs={ownable.map(toBoard)} batches={batches} capacity={capacity} />
        )}
      </section>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <ButtonLink href="/run/shifts" variant="secondary">Shifts</ButtonLink>
        <ButtonLink href="/run/earnings" variant="secondary">Earnings</ButtonLink>
      </div>
    </div>
  );
}
