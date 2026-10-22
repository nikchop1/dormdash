import { cronHandler } from "@/lib/cron-auth";
import { staleCheckoutSweep, unclaimedSweep } from "@/lib/services/cron";

// Every minute: re-ping runners at 10 min unclaimed, offer refund-cancel at 20 min,
// and clear abandoned checkouts.
export const GET = cronHandler(async () => ({ ...(await unclaimedSweep()), ...(await staleCheckoutSweep()) }));
