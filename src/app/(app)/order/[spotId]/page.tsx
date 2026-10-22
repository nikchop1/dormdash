import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { q, q1 } from "@/lib/db";
import { env, paymentsMode } from "@/lib/env";
import { coverageStatus, shiftCoverage } from "@/lib/services/coverage";
import { listBuildings, SPOT_TYPE_LABEL, type Spot } from "@/lib/services/places";
import { getPricing, flag } from "@/lib/settings";
import { fromNyWallClock, nyParts, relativeDay, fmtTime } from "@/lib/domain/time";
import { customerBlock } from "@/lib/services/orders";
import { Notice, PageHeader } from "@/components/ui/misc";
import { OrderForm, type Slot } from "./order-form";

export const metadata: Metadata = { title: "New order" };

/** 15-minute slots over the next 3 days, only inside hours where runners are scheduled. */
async function scheduleSlots(): Promise<Slot[]> {
  const cov = await shiftCoverage();
  const now = new Date();
  const earliest = now.getTime() + 30 * 60000;
  const slots: Slot[] = [];
  const start = nyParts(now);
  for (let d = 0; d < 3; d++) {
    const dayStart = fromNyWallClock(start.year, start.month, start.day, 0, 0).getTime() + d * 864e5;
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = new Date(dayStart + m * 60000);
      if (t.getTime() < earliest) continue;
      const p = nyParts(t);
      if ((cov.get(`${p.weekday}-${p.hour}`) ?? 0) === 0) continue;
      slots.push({ iso: t.toISOString(), day: relativeDay(t, now), time: fmtTime(t) });
    }
  }
  return slots;
}

export default async function NewOrderPage({ params }: { params: Promise<{ spotId: string }> }) {
  const { spotId } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(spotId)) notFound();
  const spot = await q1<Spot>("select * from public.pickup_spots where id = $1 and active", [spotId]);
  if (!spot || (spot.type === "dining_hall" && !(await flag("dining_halls_enabled")))) notFound();
  const block = customerBlock(user.profile);
  if (block) {
    return (
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <PageHeader back={{ href: "/home", label: "Home" }} title={spot.name} />
        <Notice tone="warning" title="Ordering is paused">{block}</Notice>
      </div>
    );
  }

  const [buildings, settings, schedulingOn, coverage, slots, reachable] = await Promise.all([
    listBuildings(),
    getPricing(),
    flag("scheduled_orders_enabled"),
    coverageStatus(),
    scheduleSlots(),
    q<{ building_id: string }>(
      "select building_id from public.spot_building_distances where spot_id = $1 and enabled and distance_miles <= (select max_radius_miles from public.pricing_settings where id = 1)",
      [spotId],
    ),
  ]);
  const residents = await q<{ building_id: string; n: number }>(
    `select runner_home_building_id as building_id, count(*)::int as n from public.profiles
     where runner_status = 'approved' and on_shift and status = 'active' group by 1`,
  );
  const p = user.profile;
  const reachableIds = new Set(reachable.map((r) => r.building_id));
  const nameParts = p.full_name.split(" ");

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/home", label: "Spots" }} overline={SPOT_TYPE_LABEL[spot.type]} title={spot.name}>
        <span className="text-small">{spot.address}</span>
      </PageHeader>
      <OrderForm
        spot={{ id: spot.id, name: spot.name, notes: spot.pickup_notes }}
        buildings={buildings.filter((b) => reachableIds.has(b.id)).map((b) => ({ id: b.id, name: b.name, floors: b.floor_count, doorRequiresResident: b.door_requires_resident }))}
        defaults={{
          pickupName: `${nameParts[0]} ${nameParts[1]?.[0] ?? ""}`.trim(),
          buildingId: p.building_id && reachableIds.has(p.building_id) ? p.building_id : "",
          floor: p.floor ? String(p.floor) : "",
          room: p.room ?? "",
        }}
        tipPresets={settings.tipPresets}
        maxBags={settings.maxBags}
        bagFeeCents={settings.bagFeeCents}
        creditCents={p.credit_cents}
        useCreditDefault={p.use_credit}
        runnersOnShift={coverage.onShift}
        residentsOnShift={Object.fromEntries(residents.map((r) => [r.building_id, r.n]))}
        nextWindow={coverage.next?.label ?? null}
        slots={schedulingOn ? slots : []}
        payments={{ mode: paymentsMode, publishableKey: paymentsMode === "stripe" ? env.stripe.publishableKey : null }}
      />
    </div>
  );
}
