import { cronHandler } from "@/lib/cron-auth";
import { purgeOldEvidence } from "@/lib/services/photos";
import { getPricing } from "@/lib/settings";

// Daily: delete evidence photos 90 days (configurable) after an order closes, unless a case is open.
export const GET = cronHandler(async () => purgeOldEvidence((await getPricing()).evidenceRetentionDays));
