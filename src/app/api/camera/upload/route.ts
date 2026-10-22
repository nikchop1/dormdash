import { z } from "zod";
import { apiUser } from "@/lib/auth/session";
import { q1 } from "@/lib/db";
import { ApiError, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { savePhoto, type LocationReading } from "@/lib/services/photos";

const meta = z.object({
  kind: z.enum(["pickup", "door", "problem", "case"]),
  token: z.string().min(10),
  orderId: z.string().uuid(),
  location: z.union([
    z.object({ status: z.literal("ok"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    z.object({ status: z.enum(["denied", "unavailable"]) }),
  ]),
});

/**
 * Live-camera evidence upload. Stamped server-side with the time and the one-time
 * location result (in range / out of range / denied). Raw coordinates are never stored.
 */
export const POST = route(async (req) => {
  const user = await apiUser();
  await limit(`upload:${user.id}`, 60, 3600, "uploads");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Take a photo first.");
  let m: z.infer<typeof meta>;
  try {
    m = meta.parse(JSON.parse(String(form?.get("meta") ?? "{}")));
  } catch {
    throw new ApiError(400, "camera_required", "Evidence photos have to come from the in-app camera.");
  }
  const o = await q1<{ customer_id: string; runner_id: string | null; spot_lat: number; spot_lng: number; b_lat: number; b_lng: number; radius: number; status: string }>(
    `select o.customer_id, o.runner_id, sp.lat as spot_lat, sp.lng as spot_lng, b.lat as b_lat, b.lng as b_lng, b.handoff_radius_m as radius, o.status
     from public.orders o join public.pickup_spots sp on sp.id = o.spot_id join public.buildings b on b.id = o.building_id where o.id = $1`,
    [m.orderId],
  );
  const isRunner = o?.runner_id === user.id;
  const isCustomer = o?.customer_id === user.id;
  if (!o || (m.kind === "case" ? !isCustomer && !isRunner : !isRunner)) throw new ApiError(404, "not_found", "That isn't one of your orders.");
  // Pickup is checked against the restaurant, everything else against the building.
  const target = m.kind === "pickup" || (m.kind === "problem" && o.status === "claimed") ? { lat: o.spot_lat, lng: o.spot_lng } : { lat: o.b_lat, lng: o.b_lng };
  const radiusM = m.kind === "door" ? o.radius : 150;
  const photo = await savePhoto(user.id, m.kind, file, { cameraToken: m.token, location: { reading: m.location as LocationReading, target, radiusM } });
  return { id: photo.id, capturedAt: photo.capturedAt, location: photo.locationStatus, distanceM: photo.distanceM };
});
