import { cronHandler } from "@/lib/cron-auth";
import { retryPayouts } from "@/lib/services/payouts";

// Runners are paid the moment an order completes. This only retries failed
// transfers and pays out no-show earnings an admin has released.
export const GET = cronHandler(() => retryPayouts());
