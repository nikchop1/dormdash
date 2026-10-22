import { apiUser } from "@/lib/auth/session";
import { ApiError, route } from "@/lib/http";
import { startPayoutSetup } from "@/lib/services/runners";

// Starts Stripe Connect Express onboarding (bank account + Stripe identity verification).
export const POST = route(async () => {
  const user = await apiUser();
  if (!["approved", "suspended"].includes(user.profile.runner_status)) throw new ApiError(403, "not_runner", "Payouts are for approved runners.");
  return startPayoutSetup(user.id, user.email);
});
