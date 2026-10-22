import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { releaseNoShowPayout } from "@/lib/services/cases";

// No-shows with an unverified location wait here. Approve = pay the runner; reject = refund the customer.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  await apiAdmin();
  const { approve } = await parseJson(req, z.object({ approve: z.boolean() }));
  await releaseNoShowPayout(id, approve);
  return { ok: true };
});
