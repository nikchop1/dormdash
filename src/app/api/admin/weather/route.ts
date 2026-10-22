import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { setWeatherSurge } from "@/lib/services/admin";
import { surgeSweep } from "@/lib/services/cron";

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  const { on } = await parseJson(req, z.object({ on: z.boolean() }));
  await setWeatherSurge(admin.id, on);
  await surgeSweep(); // tell on-shift runners right away instead of waiting for cron
  return { on };
});
