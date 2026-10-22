import { getAuth } from "@/lib/auth";
import { getPendingVerification } from "@/lib/auth/session";
import { ApiError, route } from "@/lib/http";
import { hit } from "@/lib/ratelimit";

const RESEND_COOLDOWN_SECONDS = 60;

export const POST = route(async () => {
  const email = await getPendingVerification();
  if (!email) throw new ApiError(400, "no_pending", "We lost track of which email to verify. Log in again and we'll send a fresh link.");
  const { count, resetAt } = await hit(`resend:${email}`, RESEND_COOLDOWN_SECONDS);
  if (count > 1) {
    const secs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    throw new ApiError(429, "cooldown", `Give it ${secs} seconds before sending another.`);
  }
  await getAuth().resendVerification(email);
  return { ok: true, cooldown: RESEND_COOLDOWN_SECONDS };
});
