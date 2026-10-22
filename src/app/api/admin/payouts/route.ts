import { apiAdmin } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { retryPayouts } from "@/lib/services/payouts";

// Runners are paid on completion; this retries anything that failed or was released from review.
export const POST = route(async () => {
  await apiAdmin();
  return retryPayouts();
});
