import { apiUser } from "@/lib/auth/session";
import { q1 } from "@/lib/db";
import { ApiError, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { postCaseMessage } from "@/lib/services/cases";
import { caseMessageSchema } from "@/lib/validation";

// Each party writes only to Dormdash admins, in their own thread. No user-to-user messages.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser({ allowBanned: true });
  await limit(`casemsg:${user.id}`, 30, 3600, "messages");
  const { body } = await parseJson(req, caseMessageSchema);
  const c = await q1<{ customer_id: string; runner_id: string | null }>("select customer_id, runner_id from public.cases where id = $1", [id]);
  if (!c) throw new ApiError(404, "not_found", "We couldn't find that case.");
  const party = c.customer_id === user.id ? "customer" : c.runner_id === user.id ? "runner" : null;
  if (!party) throw new ApiError(404, "not_found", "We couldn't find that case.");
  await postCaseMessage(user.id, id, party, body, false);
  return { ok: true };
});
