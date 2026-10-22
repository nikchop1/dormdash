import { z } from "zod";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { cancelOrder } from "@/lib/services/orders";

const schema = z.object({ reason: z.string().trim().max(200).default("Cancelled by customer") });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  const { reason } = await parseJson(req, schema);
  return cancelOrder(user.id, "customer", id, reason || "Cancelled by customer");
});
