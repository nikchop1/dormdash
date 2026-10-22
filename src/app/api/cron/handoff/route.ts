import { cronHandler } from "@/lib/cron-auth";
import { missingDeliverySweep, runnerAbsentSweep } from "@/lib/services/cron";

// Every minute: open "runner not at the door" cases after the customer's grace
// period, and flag picked-up orders that never reached the door.
export const GET = cronHandler(async () => ({ ...(await runnerAbsentSweep()), ...(await missingDeliverySweep()) }));
