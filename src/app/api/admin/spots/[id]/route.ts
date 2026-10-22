import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { upsertSpot } from "@/lib/services/admin";
import { spotSchema } from "@/lib/validation";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  await apiAdmin();
  const s = await parseJson(req, spotSchema);
  return { id: await upsertSpot(id, s) };
});
