import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { setFlag } from "@/lib/services/admin";

export const PATCH = route(async (req) => {
  await apiAdmin();
  const { key, enabled } = await parseJson(req, z.object({ key: z.string().min(1).max(64), enabled: z.boolean() }));
  await setFlag(key, enabled);
  return { ok: true };
});
