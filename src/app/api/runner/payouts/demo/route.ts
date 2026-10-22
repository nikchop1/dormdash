import { apiUser } from "@/lib/auth/session";
import { paymentsMode } from "@/lib/env";
import { ApiError, route } from "@/lib/http";
import { syncPayoutStatus } from "@/lib/services/runners";

// Demo mode only: finishes the simulated Stripe bank + identity onboarding.
export const POST = route(async () => {
  if (paymentsMode !== "demo") throw new ApiError(404, "not_found", "Not available.");
  const user = await apiUser();
  if (!user.profile.stripe_account_id) throw new ApiError(409, "no_account", "Start payout setup first.");
  return syncPayoutStatus(user.id);
});
