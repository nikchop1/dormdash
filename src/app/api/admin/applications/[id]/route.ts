import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { decideApplication } from "@/lib/services/runners";

const schema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).nullable().default(null) });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { approve, note } = await parseJson(req, schema);
  await decideApplication(admin.id, id, approve, note || null);
  return { ok: true };
});
