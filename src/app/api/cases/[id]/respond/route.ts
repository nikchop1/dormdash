import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { respondToCase } from "@/lib/services/cases";
import { caseResponseSchema } from "@/lib/validation";

// Runner's response (24-hour window). Banned runners can still respond on their own cases.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser({ allowBanned: true });
  const { response } = await parseJson(req, caseResponseSchema);
  await respondToCase(user.id, id, response);
  return { ok: true };
});
