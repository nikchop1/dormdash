import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { upsertSpot } from "@/lib/services/admin";
import { spotSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  await apiAdmin();
  const s = await parseJson(req, spotSchema);
  return { id: await upsertSpot(null, s) };
});
