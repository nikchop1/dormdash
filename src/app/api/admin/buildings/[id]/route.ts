import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { upsertBuilding } from "@/lib/services/admin";
import { buildingSchema } from "@/lib/validation";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  await apiAdmin();
  const b = await parseJson(req, buildingSchema);
  return { id: await upsertBuilding(id, b) };
});
