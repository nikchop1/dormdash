import { z } from "zod";
import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { adminUserAction } from "@/lib/services/admin";

const schema = z.object({
  action: z.enum(["suspend", "unsuspend", "make_admin", "remove_admin", "reinstate_runner", "suspend_runner", "void_strikes"]),
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const admin = await apiAdmin();
  const { action } = await parseJson(req, schema);
  await adminUserAction(admin.id, id, action);
  return { ok: true };
});
