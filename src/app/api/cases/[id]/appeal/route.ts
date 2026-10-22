import { z } from "zod";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { submitAppeal } from "@/lib/services/cases";

// One appeal, within 7 days of a confirmed-theft decision. Works while banned.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser({ allowBanned: true });
  const { text } = await parseJson(req, z.object({ text: z.string().trim().min(20, "Explain what happened (20+ characters).").max(3000) }));
  await submitAppeal(user.id, id, text);
  return { ok: true };
});
