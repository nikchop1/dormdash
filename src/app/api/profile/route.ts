import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { updateProfile } from "@/lib/services/account";
import { profileSchema } from "@/lib/validation";

export const PATCH = route(async (req) => {
  const user = await apiUser();
  const input = await parseJson(req, profileSchema);
  await updateProfile(user.id, input);
  return { ok: true };
});
