import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { openDispute } from "@/lib/services/disputes";
import { disputeSchema } from "@/lib/validation";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  await limit(`dispute:${user.id}`, 5, 3600, "problem reports");
  const input = await parseJson(req, disputeSchema);
  const disputeId = await openDispute(user.id, id, input);
  return { disputeId };
});
