import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { parseJson, route } from "@/lib/http";

// Flag a mismatch between the receipt screenshot and the food total the customer entered.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  await apiAdmin();
  const { flagged } = await parseJson(req, z.object({ flagged: z.boolean() }));
  await q("update public.orders set food_total_flagged = $2 where id = $1", [id, flagged]);
  return { ok: true };
});
