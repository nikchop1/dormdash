import { asUser } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";
import { route } from "@/lib/http";

// Mark all as read. Uses the column-level update grant + RLS (own rows only).
export const POST = route(async () => {
  const user = await apiUser({ verified: false });
  await asUser(user.id, (t) => t.query("update public.notifications set read_at = now() where read_at is null"));
  return { ok: true };
});
