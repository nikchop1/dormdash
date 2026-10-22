import { getAuth } from "@/lib/auth";
import { clearPendingVerification, loadProfile, setPendingVerification } from "@/lib/auth/session";
import { ApiError, clientIp, parseJson, route } from "@/lib/http";
import { hit, limit, LOGIN_LOCK_SECONDS, LOGIN_MAX_FAILURES, peek, resetLimit } from "@/lib/ratelimit";
import { loginSchema } from "@/lib/validation";

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/home";
}

export const POST = route(async (req) => {
  const { email, password, next } = await parseJson(req, loginSchema);
  await limit(`login-ip:${clientIp(req)}`, 30, 15 * 60, "login attempts");

  const key = `login-fail:${email}`;
  const prior = await peek(key, LOGIN_LOCK_SECONDS);
  if (prior && prior.count >= LOGIN_MAX_FAILURES) {
    const mins = Math.max(1, Math.ceil((prior.resetAt.getTime() - Date.now()) / 60000));
    throw new ApiError(429, "locked", `Too many wrong passwords. This account is locked for ${mins} more min. Forgot it? Reset your password.`);
  }

  const auth = getAuth();
  const res = await auth.signIn(email, password);
  if (!res.ok) {
    if (res.code === "email_not_confirmed") {
      await setPendingVerification(email);
      return { ok: false, verify: true, next: "/verify-email" };
    }
    if (res.code === "invalid_credentials") {
      const { count } = await hit(key, LOGIN_LOCK_SECONDS);
      const left = LOGIN_MAX_FAILURES - count;
      throw new ApiError(
        401,
        "invalid_credentials",
        left > 0
          ? `That email and password don't match. ${left} ${left === 1 ? "try" : "tries"} left before a 15-minute lockout.`
          : "Too many wrong passwords. This account is locked for 15 min. Forgot it? Reset your password.",
      );
    }
    throw new ApiError(502, "auth_error", "We couldn't reach the login service. Try again in a moment.");
  }

  const profile = await loadProfile(res.user.id);
  if (!profile || profile.status !== "active") {
    await auth.signOut();
    throw new ApiError(
      403,
      "suspended",
      profile?.status === "suspended" ? "This account is suspended. Email support@floordrop.app if you think that's a mistake." : "This account no longer exists.",
    );
  }
  await resetLimit(key);
  await clearPendingVerification();
  return { ok: true, next: safeNext(next) };
});
