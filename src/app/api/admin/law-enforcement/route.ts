import { apiAdmin } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { parseJson, route } from "@/lib/http";
import { lawEnforcementSchema } from "@/lib/validation";

// Admin-only log. Information is shared only in response to a formal request.
export const POST = route(async (req) => {
  const admin = await apiAdmin();
  const r = await parseJson(req, lawEnforcementSchema);
  await q(
    "insert into public.law_enforcement_requests (agency, officer, reference, request_date, shared, case_id, created_by) values ($1,$2,$3,$4::date,$5,$6,$7)",
    [r.agency, r.officer, r.reference, r.requestDate, r.shared, r.caseId, admin.id],
  );
  return { ok: true };
});
