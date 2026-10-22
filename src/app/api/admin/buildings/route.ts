import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { upsertBuilding } from "@/lib/services/admin";
import { buildingSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  await apiAdmin();
  const b = await parseJson(req, buildingSchema);
  return { id: await upsertBuilding(null, b) };
});
