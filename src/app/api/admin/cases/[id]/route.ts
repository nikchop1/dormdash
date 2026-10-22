import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { resolveCase } from "@/lib/services/cases";
import { caseResolveSchema } from "@/lib/validation";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { outcome, note } = await parseJson(req, caseResolveSchema);
  return resolveCase(admin.id, id, outcome, note);
});
