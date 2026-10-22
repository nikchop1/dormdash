import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { resolveDispute } from "@/lib/services/disputes";
import { disputeResolutionSchema } from "@/lib/validation";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { actions, note } = await parseJson(req, disputeResolutionSchema);
  const outcome = await resolveDispute(admin.id, id, actions, note);
  return { outcome };
});
