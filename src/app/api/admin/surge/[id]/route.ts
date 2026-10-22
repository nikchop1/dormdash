import { apiAdmin } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { deleteSurgeWindow, upsertSurgeWindow } from "@/lib/services/admin";
import { surgeWindowSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await apiAdmin();
  const w = await parseJson(req, surgeWindowSchema);
  await upsertSurgeWindow(id, w);
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  await apiAdmin();
  await deleteSurgeWindow(id);
  return { ok: true };
});
