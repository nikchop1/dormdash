import { getAuth } from "@/lib/auth";
import { apiUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ApiError, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { emailTaken } from "@/lib/services/account";
import { changeEmailSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const user = await apiUser();
  const { email } = await parseJson(req, changeEmailSchema(env.allowedEmailDomains));
  await limit(`change-email:${user.id}`, 3, 3600, "email changes");
  if (email === user.email) throw new ApiError(400, "same", "That's already your email.", { email: "That's already your email." });
  if (await emailTaken(email)) {
    throw new ApiError(409, "email_taken", "Another account already uses that email.", { email: "Another account already uses that email." });
  }
  await getAuth().requestEmailChange(user.id, email);
  return { ok: true };
});
