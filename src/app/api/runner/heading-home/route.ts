import { z } from "zod";
import { apiRunner } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { parseJson, route } from "@/lib/http";
import { headingHomeFilter } from "@/lib/domain/runs";
import { openJobs } from "@/lib/services/orders";
import { getPricing } from "@/lib/settings";

const schema = z.object({
  buildingId: z.string().uuid(),
  location: z.union([
    z.object({ status: z.literal("ok"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    z.object({ status: z.enum(["denied", "unavailable"]) }),
  ]),
});

/**
 * "I'm heading to [building]": one location check (never stored, never tracked),
 * returns the IDs of open orders picked up near here and going to that building.
 */
export const POST = route(async (req) => {
  const user = await apiRunner();
  const { buildingId, location } = await parseJson(req, schema);
  const s = await getPricing();
  let ids: string[] = [];
  if (location.status === "ok") {
    const jobs = (await openJobs()).filter((j) => j.customer_id !== user.id);
    ids = headingHomeFilter(
      jobs.map((j) => ({ id: j.id, spotId: j.spot_id, spotName: j.spot_name, spotLat: j.spot_lat, spotLng: j.spot_lng, buildingId: j.building_id, floor: j.floor, payCents: 0, foodValueCents: 0, createdAt: j.created_at })),
      { lat: location.lat, lng: location.lng },
      buildingId,
      s.headingHomeRadiusMiles,
    ).map((j) => j.id);
  }
  await q("insert into public.heading_home_sessions (runner_id, building_id, location_status, orders_shown) values ($1, $2, $3, $4)", [
    user.id,
    buildingId,
    location.status,
    ids.length,
  ]);
  return { orderIds: ids, location: location.status, radiusMiles: s.headingHomeRadiusMiles };
});
