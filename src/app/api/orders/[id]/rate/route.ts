import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { rateOrder } from "@/lib/services/orders";
import { ratingSchema } from "@/lib/validation";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  const { stars, comment } = await parseJson(req, ratingSchema);
  await rateOrder(user.id, id, stars, comment);
  return { ok: true };
});
