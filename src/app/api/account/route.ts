import { cookies } from "next/headers";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { deleteAccount } from "@/lib/services/account";
import { deleteAccountSchema } from "@/lib/validation";

export const DELETE = route(async (req) => {
  const user = await apiUser({ verified: false });
  await parseJson(req, deleteAccountSchema);
  await deleteAccount(user.id);
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name === "fd_session" || c.name.startsWith("sb-")) jar.delete(c.name);
  return { ok: true, next: "/?deleted=1" };
});
