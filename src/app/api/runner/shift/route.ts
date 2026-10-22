import { z } from "zod";
import { apiRunner } from "@/lib/auth/session";
import { paymentsMode } from "@/lib/env";
import { ApiError, parseJson, route } from "@/lib/http";
import { setOnShift } from "@/lib/services/runners";

export const POST = route(async (req) => {
  const user = await apiRunner();
  const { on } = await parseJson(req, z.object({ on: z.boolean() }));
  if (on && paymentsMode === "paypal" && !user.profile.payout_email) {
    throw new ApiError(409, "no_payout", "Add your PayPal email in Earnings before going on shift, so we can pay you.");
  }
  await setOnShift(user.id, on);
  return { on };
});
