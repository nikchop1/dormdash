import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CloudRain, Moon, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { coverageStatus } from "@/lib/services/coverage";
import { getBuilding, spotsForBuilding, SPOT_TYPE_LABEL } from "@/lib/services/places";
import { getCurrentSurge, flag } from "@/lib/settings";
import { formatMiles, walkMinutes } from "@/lib/domain/geo";
import { STATUS_LABEL, type OrderStatus } from "@/lib/domain/orders";
import { fmtTime } from "@/lib/domain/time";
import { ElevatorMark } from "@/components/brand";
import { SpotIcon } from "@/components/spot-icon";
import { EmptyState, FloorBadge, List, Money, Notice, Row } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const p = user.profile;
  const building = p.building_id ? await getBuilding(p.building_id) : null;
  const [surge, diningOn, coverage, active] = await Promise.all([
    getCurrentSurge(),
    flag("dining_halls_enabled"),
    coverageStatus(),
    q<{ id: string; code: string; status: OrderStatus; eta: Date | null; spot_name: string }>(
      `select o.id, o.code, o.status, o.eta, sp.name as spot_name from public.orders o join public.pickup_spots sp on sp.id = o.spot_id
       where o.customer_id = $1 and o.status in ('requested','claimed','picked_up','on_the_way') order by o.created_at desc`,
      [user.id],
    ),
  ]);
  const spots = building ? await spotsForBuilding({ buildingId: building.id, floor: p.floor ?? 1, surge, diningHallsEnabled: diningOn }) : [];
  const firstName = p.full_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      {sp.error === "forbidden" && (
        <Notice tone="warning" className="mt-4" icon={<TriangleAlert />} title="That page is admins only">
          You were sent back here.
        </Notice>
      )}
      <header className="pt-5 pb-5">
        <p className="overline">{sp.welcome ? "You're verified. Welcome in." : `Hey ${firstName}`}</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-display text-display leading-[0.95] font-black uppercase">
            What are we<br />bringing up?
          </h1>
          {p.floor && <FloorBadge floor={p.floor} size="lg" className="shrink-0" />}
        </div>
        <p className="mt-3 text-small text-ink-2">
          To {building?.name ?? "your building"}, room {p.room}.{" "}
          <Link href="/profile/edit" className="link text-ink">Change</Link>
        </p>
      </header>

      {active.length > 0 && (
        <section aria-label="Your active orders" className="mb-6 space-y-2">
          {active.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="flex items-center gap-4 rounded-md bg-ink-fill px-4 py-3.5 text-on-ink-fill transition-opacity hover:opacity-95"
            >
              <span className="flex-1">
                <span className="block text-caption font-semibold tracking-wide text-accent uppercase">{STATUS_LABEL[o.status]}</span>
                <span className="block font-semibold">{o.spot_name}</span>
              </span>
              {o.eta && (
                <span className="text-right">
                  <span className="block text-caption opacity-70">ETA</span>
                  <span className="tnum font-display text-heading font-extrabold">{fmtTime(o.eta)}</span>
                </span>
              )}
              <ChevronRight className="size-5 opacity-70" aria-hidden />
            </Link>
          ))}
        </section>
      )}

      <div className="mb-5 space-y-2">
        {surge && (
          <Notice tone="accent" icon={surge.source === "weather" ? <CloudRain /> : <Moon />} title={`Busy pricing: ${surge.multiplier}x delivery fee`}>
            {surge.source === "weather"
              ? "Bad weather means fewer runners want to go out. Fees are up until it clears."
              : `${surge.label}. Late-night demand is high, so delivery fees are up. Tips are never multiplied.`}
          </Notice>
        )}
        {coverage.onShift === 0 && (
          <Notice tone="warning" icon={<TriangleAlert />} title="Nobody's running right now">
            {coverage.next ? (
              <>Next crew clocks in <span className="font-semibold text-ink">{coverage.next.label}</span>. You can still schedule an order for then.</>
            ) : (
              "No shifts are scheduled yet this week. Check back soon."
            )}
          </Notice>
        )}
      </div>

      <section aria-labelledby="spots-heading">
        <div className="flex items-baseline justify-between border-t-2 border-line-strong pt-3 pb-1">
          <h2 id="spots-heading" className="text-heading font-semibold">Near {building?.short_name ?? "you"}</h2>
          <p className="text-small text-ink-3">Fee to floor {p.floor}</p>
        </div>
        {spots.length === 0 ? (
          <EmptyState title="Nothing nearby yet" mark={<ElevatorMark />}>
            We only list spots we&rsquo;ve walked ourselves, within a few blocks of {building?.name ?? "your building"}. More are on the way.
          </EmptyState>
        ) : (
          <List label="Pickup spots" className="border-t-0">
            {spots.map((s) => (
              <Row
                key={s.id}
                href={`/order/${s.id}`}
                leading={<SpotIcon type={s.type} />}
                trailing={
                  s.fee_cents !== null && (
                    <span className="flex flex-col items-end">
                      <Money cents={s.fee_cents} className="font-display text-heading font-extrabold" />
                      {surge && <span className="text-caption text-accent-ink">busy</span>}
                    </span>
                  )
                }
              >
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="tnum block truncate text-small text-ink-3">
                  {SPOT_TYPE_LABEL[s.type]} · {formatMiles(s.distance_miles)} · {Math.max(1, Math.round(walkMinutes(s.distance_miles)))} min walk
                </span>
              </Row>
            ))}
          </List>
        )}
        <p className="mt-4 text-small text-ink-3">
          You order and pay for the food yourself, as a pickup order in the spot&rsquo;s own app. We just bring it up.{" "}
          <Link href="/legal/terms#how-it-works" className="link text-ink-2">How that works</Link>
        </p>
      </section>
    </div>
  );
}
