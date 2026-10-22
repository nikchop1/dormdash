import { apiUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { ApiError, parseJson, route } from "@/lib/http";
import { payoutEmailSchema } from "@/lib/validation";

// Runners get paid via PayPal Payouts to this email. It doesn't have to be their NYU one.
export const POST = route(async (req) => {
  const user = await apiUser();
  if (!["approved", "suspended"].includes(user.profile.runner_status)) throw new ApiError(403, "not_runner", "Only runners need a payout email.");
  const { payoutEmail } = await parseJson(req, payoutEmailSchema);
  await q("update public.profiles set payout_email = $2 where id = $1", [user.id, payoutEmail]);
  return { ok: true };
});
