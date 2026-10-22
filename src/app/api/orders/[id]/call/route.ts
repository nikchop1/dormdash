import { apiUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { callParty } from "@/lib/services/orders";

// Customer's "Call runner". Returns a tel: target for this tap only; never shown as text.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  await limit(`call:${user.id}`, 30, 3600, "calls");
  return callParty(user.id, id, "customer");
});
