import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { setDistanceEnabled } from "@/lib/services/admin";

const schema = z.object({ spotId: z.string().uuid(), buildingId: z.string().uuid(), enabled: z.boolean() });

export const PATCH = route(async (req) => {
  await apiAdmin();
  const { spotId, buildingId, enabled } = await parseJson(req, schema);
  await setDistanceEnabled(spotId, buildingId, enabled);
  return { ok: true };
});
