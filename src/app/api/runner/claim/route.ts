import { z } from "zod";
import { apiRunner } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { claimOrders } from "@/lib/services/orders";

const schema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(10),
  headingHome: z.boolean().default(false),
  buildingId: z.string().uuid().nullable().default(null),
});

export const POST = route(async (req) => {
  const user = await apiRunner();
  const { orderIds, headingHome, buildingId } = await parseJson(req, schema);
  const claimed = await claimOrders(user.id, orderIds, { headingHome, buildingId });
  return { claimed: claimed.map((o) => o.id) };
});
