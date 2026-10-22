import { getAuth } from "@/lib/auth";
import { clientIp, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { forgotSchema } from "@/lib/validation";

// Always answers the same way, so it can't be used to find out who has an account.
export const POST = route(async (req) => {
  const { email } = await parseJson(req, forgotSchema);
  await limit(`forgot-ip:${clientIp(req)}`, 10, 3600, "reset requests");
  await limit(`forgot:${email}`, 3, 3600, "reset requests for this email");
  await getAuth().sendPasswordReset(email);
  return { ok: true };
});
