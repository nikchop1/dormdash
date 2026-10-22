import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { cancelOrder } from "@/lib/services/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { reason } = await parseJson(req, z.object({ reason: z.string().trim().min(3, "Add a short reason the customer will see.").max(200) }));
  return cancelOrder(admin.id, "admin", id, reason);
});
