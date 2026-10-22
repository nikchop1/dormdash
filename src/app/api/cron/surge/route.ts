import { cronHandler } from "@/lib/cron-auth";
import { surgeSweep } from "@/lib/services/cron";

// Every minute: record surge window transitions and tell on-shift runners when busy pricing starts.
export const GET = cronHandler(() => surgeSweep());
