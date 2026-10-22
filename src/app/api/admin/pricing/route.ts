import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { savePricing } from "@/lib/services/admin";
import { pricingSchema } from "@/lib/validation";

export const PUT = route(async (req) => {
  const admin = await apiAdmin();
  const p = await parseJson(req, pricingSchema);
  await savePricing(admin.id, p);
  return { ok: true };
});
