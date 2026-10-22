import { cronHandler } from "@/lib/cron-auth";
import { lateSweep } from "@/lib/services/cron";

// Every minute: auto-refund the delivery fee on orders past ETA + grace.
export const GET = cronHandler(() => lateSweep());
