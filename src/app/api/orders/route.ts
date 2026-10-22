import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { createOrder } from "@/lib/services/orders";
import { createOrderSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const user = await apiUser();
  await limit(`order:${user.id}`, 8, 10 * 60, "orders");
  const input = await parseJson(req, createOrderSchema);
  const res = await createOrder(user, input);
  return { orderId: res.orderId, code: res.code, clientSecret: res.clientSecret, mode: res.mode };
});
