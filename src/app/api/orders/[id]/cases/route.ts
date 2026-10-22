import { apiUser } from "@/lib/auth/session";
import { q1 } from "@/lib/db";
import { ApiError, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { openCase } from "@/lib/services/cases";
import { caseOpenSchema } from "@/lib/validation";

// Customer-opened cases: "My food never arrived", "I gave my PIN but didn't get my food",
// and post-delivery problem reports (theft/never-received on PIN orders are auto-rejected).
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  await limit(`case:${user.id}`, 5, 3600, "reports");
  const input = await parseJson(req, caseOpenSchema);
  const o = await q1<{ customer_id: string }>("select customer_id from public.orders where id = $1", [id]);
  if (!o || o.customer_id !== user.id) throw new ApiError(404, "not_found", "We couldn't find that order.");
  if (input.type === "customer_claim" && !input.reason) throw new ApiError(400, "invalid", "Pick what went wrong.");
  const c = await openCase({ type: input.type, orderId: id, openedBy: user.id, reason: input.reason ?? input.type, description: input.description, photoId: input.photoId });
  return { caseId: c.id, autoRejected: c.auto_rejected, outcomeNote: c.outcome_note };
});
