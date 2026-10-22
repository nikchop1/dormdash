import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { respondToDispute } from "@/lib/services/disputes";
import { disputeResponseSchema } from "@/lib/validation";

// Suspended runners can still respond to reports about their past deliveries.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  const { response } = await parseJson(req, disputeResponseSchema);
  await respondToDispute(user.id, id, response);
  return { ok: true };
});
