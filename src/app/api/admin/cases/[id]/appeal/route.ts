import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { decideAppeal } from "@/lib/services/cases";

// The decision on an appeal is final.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { decision, note } = await parseJson(req, z.object({ decision: z.enum(["upheld", "overturned"]), note: z.string().trim().max(1000).default("") }));
  await decideAppeal(admin.id, id, decision, note);
  return { ok: true };
});
