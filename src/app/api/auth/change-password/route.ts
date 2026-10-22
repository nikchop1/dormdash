import { getAuth } from "@/lib/auth";
import { apiUser } from "@/lib/auth/session";
import { ApiError, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { changePasswordSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const user = await apiUser();
  const input = await parseJson(req, changePasswordSchema);
  await limit(`change-pw:${user.id}`, 5, 15 * 60, "password changes");
  const auth = getAuth();
  if (!(await auth.checkPassword(user.email, input.currentPassword))) {
    throw new ApiError(400, "wrong_password", "Your current password isn't right.", { currentPassword: "Your current password isn't right." });
  }
  await auth.updatePassword(user.id, input.password);
  return { ok: true };
});
