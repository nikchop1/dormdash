import "server-only";
import { q, q1, type Queryable } from "@/lib/db";
import { haversineMiles, roundMiles } from "@/lib/domain/geo";
import { quoteDelivery, isQuoteError, type ActiveSurge, type PricingSettings } from "@/lib/domain/pricing";
import { getPricing } from "@/lib/settings";

export type Building = {
  id: string;
  name: string;
  short_name: string;
  address: string;
  lat: number;
  lng: number;
  floor_count: number;
  door_requires_resident: boolean;
  active: boolean;
};

export type Spot = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: "restaurant" | "cafe" | "convenience" | "dining_hall";
  active: boolean;
  pickup_notes: string;
  verify_before_launch: boolean;
};

export const SPOT_TYPE_LABEL: Record<Spot["type"], string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  convenience: "Bodega & convenience",
  dining_hall: "Dining hall",
};

export async function listBuildings(opts: { includeInactive?: boolean } = {}) {
  return q<Building>(`select * from public.buildings ${opts.includeInactive ? "" : "where active"} order by name`);
}

export async function getBuilding(id: string) {
  return q1<Building>("select * from public.buildings where id = $1", [id]);
}

/**
 * Recompute every spot↔building distance. Pairs beyond the max radius are forced
 * off; pairs inside it keep whatever enabled state the admin chose (new pairs default on).
 */
export async function recomputeDistances(db: Queryable | null = null, settings?: PricingSettings) {
  const run = db ?? { query: q };
  const s = settings ?? (await getPricing());
  const spots = await run.query<Spot>("select * from public.pickup_spots");
  const buildings = await run.query<Building>("select * from public.buildings");
  for (const sp of spots) {
    for (const b of buildings) {
      const d = roundMiles(haversineMiles(sp, b));
      const inRange = d <= s.maxRadiusMiles + 1e-9;
      await run.query(
        `insert into public.spot_building_distances (spot_id, building_id, distance_miles, enabled)
         values ($1, $2, $3, $4)
         on conflict (spot_id, building_id) do update set
           distance_miles = excluded.distance_miles,
           enabled = case when $4 then spot_building_distances.enabled else false end`,
        [sp.id, b.id, d, inRange],
      );
    }
  }
}

export type SpotForCustomer = Spot & { distance_miles: number; fee_cents: number | null };

/** Active spots a customer in `buildingId` can order from, nearest first, with the delivery fee up front. */
export async function spotsForBuilding(opts: {
  buildingId: string;
  floor: number;
  surge: ActiveSurge | null;
  diningHallsEnabled: boolean;
}): Promise<SpotForCustomer[]> {
  const s = await getPricing();
  const rows = await q<Spot & { distance_miles: number }>(
    `select sp.*, d.distance_miles from public.pickup_spots sp
     join public.spot_building_distances d on d.spot_id = sp.id and d.building_id = $1
     where sp.active and d.enabled and d.distance_miles <= $2
       and ($3 or sp.type <> 'dining_hall')
     order by d.distance_miles, sp.name`,
    [opts.buildingId, s.maxRadiusMiles, opts.diningHallsEnabled],
  );
  return rows.map((r) => {
    const quote = quoteDelivery({ distanceMiles: r.distance_miles, floor: opts.floor, tipCents: 0, surge: opts.surge, settings: s });
    return { ...r, distance_miles: Number(r.distance_miles), fee_cents: isQuoteError(quote) ? null : quote.deliveryFeeCents };
  });
}

export async function spotDistance(spotId: string, buildingId: string) {
  return q1<{ distance_miles: number; enabled: boolean }>(
    "select distance_miles, enabled from public.spot_building_distances where spot_id = $1 and building_id = $2",
    [spotId, buildingId],
  );
}
