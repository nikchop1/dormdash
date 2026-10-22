import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { postCaseMessage } from "@/lib/services/cases";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { party, body } = await parseJson(req, z.object({ party: z.enum(["customer", "runner"]), body: z.string().trim().min(1).max(2000) }));
  await postCaseMessage(admin.id, id, party, body, true);
  return { ok: true };
});
