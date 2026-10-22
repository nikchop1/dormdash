import { z } from "zod";
import { apiRunner } from "@/lib/auth/session";
import { ApiError, parseJson, route } from "@/lib/http";
import { runnerGate } from "@/lib/services/orders";
import { setOnShift } from "@/lib/services/runners";

export const POST = route(async (req) => {
  const user = await apiRunner();
  const { on } = await parseJson(req, z.object({ on: z.boolean() }));
  if (on) {
    const g = await runnerGate(user.id);
    if (!g.payouts) throw new ApiError(409, "no_payout", "Set up payouts (bank + identity) before going on shift, so we can pay you.");
    if (!g.phone) throw new ApiError(409, "no_phone", "Add a phone number to your profile first. Customers call you through the app during handoffs.");
    if (g.flagged) throw new ApiError(403, "flagged", "Your account is under review, so running is paused.");
  }
  await setOnShift(user.id, on);
  return { on };
});
