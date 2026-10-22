import { getAuth } from "@/lib/auth";
import { ApiError, parseJson, route } from "@/lib/http";
import { resetLimit } from "@/lib/ratelimit";
import { resetSchema } from "@/lib/validation";

// The reset link signs the user in (see /auth/confirm); this sets the new password.
export const POST = route(async (req) => {
  const { password } = await parseJson(req, resetSchema);
  const auth = getAuth();
  const user = await auth.getUser();
  if (!user) throw new ApiError(401, "expired", "Your reset link expired. Request a new one and use it within an hour.");
  await auth.updatePassword(user.id, password);
  await resetLimit(`login-fail:${user.email}`);
  return { ok: true, next: "/home" };
});
