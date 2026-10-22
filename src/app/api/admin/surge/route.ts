import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { upsertSurgeWindow } from "@/lib/services/admin";
import { surgeWindowSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  await apiAdmin();
  const w = await parseJson(req, surgeWindowSchema);
  await upsertSurgeWindow(null, w);
  return { ok: true };
});
