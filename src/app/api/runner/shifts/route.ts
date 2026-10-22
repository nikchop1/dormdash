import { apiRunner } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { saveShifts } from "@/lib/services/runners";
import { shiftsSchema } from "@/lib/validation";

export const PUT = route(async (req) => {
  const user = await apiRunner();
  const { slots } = await parseJson(req, shiftsSchema);
  await saveShifts(user.id, slots);
  return { ok: true, count: slots.length };
});
