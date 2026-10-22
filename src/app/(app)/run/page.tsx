import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Check, ChevronRight, CircleAlert, X } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { cn } from "@/lib/cn";
import { unlockCopy } from "@/lib/domain/levels";
import { formatCents } from "@/lib/domain/pricing";
import { fmtTime, nowMs } from "@/lib/domain/time";
import { latestApplication, myShifts, earningsSummary } from "@/lib/services/runners";
import { levelFor, openJobs, runnerActiveJobs, runnerGate } from "@/lib/services/orders";
import { listBuildings } from "@/lib/services/places";
import { getCurrentSurge, getPricing } from "@/lib/settings";
import { ElevatorMark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Money, Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import type { BoardJob } from "@/components/job-board";
import { RunnerBoard, ShiftToggle } from "./runner-board";

export const metadata: Metadata = { title: "Run" };

function Pitch() {
  return (
    <div className="mt-2 flex flex-col gap-6">
      <p className="text-body-lg text-ink-2">
        You&rsquo;re already walking back to your dorm. Grab a couple of bags on the way, ride the elevator, get paid. Pick your own hours.
      </p>
      <dl className="divide-y divide-line border-y border-line">
        {[
          ["75%", "of every delivery fee, plus 100% of tips"],
          ["Instant", "pay the moment the customer gives you their PIN"],
          ["Full pay", "if the customer isn't there for the handoff"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-4 py-3">
            <dt className="tnum w-20 shrink-0 font-display text-title font-extrabold">{k}</dt>
            <dd className="text-small text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
      <ButtonLink href="/run/apply" size="lg" className="self-start">Apply to run</ButtonLink>
      <p className="text-small text-ink-3">You&rsquo;ll need your NYU ID. Read the <Link href="/legal/runner-agreement" className="link">Runner Agreement</Link> first.</p>
    </div>
  );
}

function GateRow({ ok, label, action }: { ok: boolean; label: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden className={cn("flex size-6 items-center justify-center rounded-xs", ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
        {ok ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
      </span>
      <span className={cn("flex-1 text-small", ok ? "text-ink-2" : "font-semibold")}>{label}<span className="sr-only">{ok ? " done" : " not done"}</span></span>
      {!ok && action}
    </li>
  );
}

export default async function RunPage() {
  const user = await requireUser();
  const p = user.profile;

  if (p.runner_status !== "approved") {
    const app = await latestApplication(user.id);
    return (
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <PageHeader overline="Run" title={p.runner_status === "none" ? "Get paid on your way home" : "Runner status"} />
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
              Your account hit the strike limit or was paused by an admin. We&rsquo;ll review it and email you. Money you&rsquo;ve earned still pays out.
            </Notice>
            <ButtonLink href="/run/earnings" variant="secondary" className="self-start">See earnings</ButtonLink>
          </div>
        )}
      </div>
    );
  }

  const [settings, active, shifts, summary, surge, gate, buildings] = await Promise.all([
    getPricing(),
    runnerActiveJobs(user.id),
    myShifts(user.id),
    earningsSummary(user.id),
    getCurrentSurge(),
    runnerGate(user.id),
    listBuildings(),
  ]);
  const level = await levelFor({ query: q }, user.id, settings);
  const jobs = p.on_shift && gate.ok ? await openJobs() : [];
  const now = nowMs();
  const toBoard = (j: (typeof jobs)[number]): BoardJob => ({
    id: j.id,
    spotId: j.spot_id,
    spotName: j.spot_name,
    spotLat: j.spot_lat,
    spotLng: j.spot_lng,
    buildingId: j.building_id,
    buildingShort: j.building_short,
    floor: j.floor,
    distanceMiles: Number(j.distance_miles),
    payCents: j.runner_fee_cents + j.tip_cents,
    tipCents: j.tip_cents,
    foodValueCents: j.food_value_cents,
    waitedMin: Math.max(0, Math.floor((now - j.created_at.getTime()) / 60000)),
    scheduledLabel: j.scheduled_for ? fmtTime(j.scheduled_for) : null,
    surge: j.surge_multiplier > 1,
    locked: unlockCopy(level, j.food_value_cents, settings.levelTiers),
    createdAt: j.created_at.toISOString(),
  });
  const board = jobs.filter((j) => j.customer_id !== user.id).map(toBoard);
  const capacity = Math.max(0, settings.maxActiveOrders - active.length);
  const activeFood = active.reduce((s, o) => s + o.food_value_cents, 0);
  const home = buildings.find((b) => b.id === p.runner_home_building_id) ?? buildings[0];

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader overline={`Hey ${p.full_name.split(" ")[0]}`} title="Run" />

      {!gate.ok && (
        <section aria-labelledby="gate-h" className="mb-6 rounded-md border-2 border-line-strong p-4">
          <h2 id="gate-h" className="font-semibold">Before you can claim orders</h2>
          <ul className="mt-2 divide-y divide-line">
            <GateRow ok={gate.emailVerified} label="NYU email verified" />
            <GateRow ok={gate.phone} label="Phone number on your profile" action={<ButtonLink href="/profile/edit" size="sm" variant="ink">Add</ButtonLink>} />
            <GateRow ok={gate.idApproved} label="NYU ID approved by an admin" />
            <GateRow ok={gate.payouts} label="Payouts set up (bank + Stripe identity check)" action={<ButtonLink href="/run/earnings" size="sm" variant="ink">Set up</ButtonLink>} />
            {gate.flagged && <GateRow ok={false} label="Account under review by an admin" />}
          </ul>
        </section>
      )}

      <ShiftToggle on={p.on_shift} disabled={!gate.ok} />

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

      <section aria-labelledby="level-h" className="mt-4 border-b border-line pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="level-h" className="font-semibold">Level {level.level}</h2>
          <span className="tnum text-small text-ink-2">{level.maxFoodCents === null ? "No order limit" : `Orders up to ${formatCents(level.maxFoodCents)} of food`}</span>
        </div>
        {level.nextAt !== null ? (
          <>
            <div className="mt-2 h-2 w-full bg-sunken" aria-hidden>
              <div className="h-2 bg-ink-fill" style={{ width: `${Math.min(100, (level.progress / level.nextAt) * 100)}%` }} />
            </div>
            <p className="tnum mt-1.5 text-small text-ink-3">{level.remaining} more {level.remaining === 1 ? "delivery" : "deliveries"} to Level {level.level + 1}</p>
          </>
        ) : (
          <p className="mt-1 text-small text-ink-3">Top level. Any order, any size.</p>
        )}
      </section>

      {(shifts.length === 0 || summary.activeStrikes > 0) && (
        <div className="mt-4 flex flex-col gap-2">
          {shifts.length === 0 && (
            <Notice tone="info" icon={<CalendarDays />} title="Pick your usual hours" action={<ButtonLink href="/run/shifts" size="sm" variant="secondary">Shifts</ButtonLink>}>
              Customers see when runners are around, so set the hours you&rsquo;re usually free.
            </Notice>
          )}
          {summary.activeStrikes > 0 && (
            <Notice tone="danger" icon={<CircleAlert />} title={`${summary.activeStrikes} of ${settings.strikeThreshold} strikes`}>
              At {settings.strikeThreshold}, running pauses until an admin reviews it.
            </Notice>
          )}
        </div>
      )}

      {active.length > 0 && (
        <Link href="/run/active" className="mt-6 flex items-center gap-4 rounded-md bg-ink-fill px-5 py-4 text-on-ink-fill transition-opacity hover:opacity-95">
          <span className="flex-1">
            <span className="block text-caption font-semibold tracking-wide text-accent-on-fill uppercase">Your run</span>
            <span className="tnum block font-display text-title leading-none font-extrabold">{active.length} {active.length === 1 ? "order" : "orders"} · {formatCents(active.reduce((s, o) => s + o.runner_fee_cents + o.tip_cents, 0))}</span>
            <span className="block text-small opacity-80">Open the stop list</span>
          </span>
          <ChevronRight className="size-6" aria-hidden />
        </Link>
      )}

      <section className="mt-8">
        <SectionTitle action={p.on_shift && gate.ok ? <span className="tnum text-small text-ink-3">{board.length} open · {active.length} of {settings.maxActiveOrders} active</span> : undefined}>Job board</SectionTitle>
        {!gate.ok ? (
          <EmptyState title="Almost there" mark={<ElevatorMark />}>Finish the checklist above and the board opens up.</EmptyState>
        ) : !p.on_shift ? (
          <EmptyState title="Board's hidden" mark={<ElevatorMark />}>Go on shift to see open jobs. We&rsquo;ll only ping you while you&rsquo;re on.</EmptyState>
        ) : board.length === 0 ? (
          <EmptyState title="Board's quiet" mark={<ElevatorMark />}>Stay on shift and we&rsquo;ll ping you the second something drops.{surge ? " Busy pricing is on, so it won't be quiet for long." : ""}</EmptyState>
        ) : (
          <RunnerBoard
            jobs={board}
            capacity={capacity}
            foodCapCents={level.maxFoodCents === null ? null : level.maxFoodCents * 2}
            activeFoodCents={activeFood}
            buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
            homeBuildingId={home?.id ?? ""}
          />
        )}
      </section>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <ButtonLink href="/run/shifts" variant="secondary">Shifts</ButtonLink>
        <ButtonLink href="/run/earnings" variant="secondary">Earnings</ButtonLink>
      </div>
    </div>
  );
}
