import { cronHandler } from "@/lib/cron-auth";
import { runPayouts } from "@/lib/services/payouts";

// Daily: pay each runner's available balance (past the dispute hold) via PayPal Payouts.
export const GET = cronHandler(() => runPayouts());
