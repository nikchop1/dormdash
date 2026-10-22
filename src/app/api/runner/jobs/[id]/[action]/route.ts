import { z } from "zod";
import { apiRunner } from "@/lib/auth/session";
import { ApiError, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { atDoor, callParty, deliverOrder, markNoShow, pickupOrder, unclaimOrder } from "@/lib/services/orders";
import { runnerProblem } from "@/lib/services/cases";
import { deliverSchema, problemSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; action: string }> };
const photo = z.object({ photoId: z.string().uuid("Take the photo with the in-app camera first.") });

export const POST = route<Ctx>(async (req, { params }) => {
  const { id, action } = await params;
  const user = await apiRunner();
  switch (action) {
    case "drop":
    case "unclaim":
      return unclaimOrder(user.id, id);
    case "pickup": {
      const { photoId } = await parseJson(req, photo);
      await pickupOrder(user.id, id, photoId);
      return { ok: true };
    }
    case "at-door": {
      const { photoId } = await parseJson(req, photo);
      return atDoor(user.id, id, photoId);
    }
    case "call":
      await limit(`call:${user.id}`, 30, 3600, "calls");
      return callParty(user.id, id, "runner");
    case "deliver": {
      await limit(`pin:${user.id}:${id}`, 10, 600, "PIN attempts");
      const { pin } = await parseJson(req, deliverSchema);
      const res = await deliverOrder(user.id, id, pin);
      if ("wrongPin" in res && res.wrongPin) {
        const left = res.attemptsLeft ?? 0;
        throw new ApiError(
          400,
          "wrong_pin",
          left > 0 ? `That's not the PIN. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong PINs. Call the customer, or wait out the countdown.",
          { pin: "Wrong PIN" },
        );
      }
      return res;
    }
    case "no-show":
      return markNoShow(user.id, id);
    case "problem": {
      const input = await parseJson(req, problemSchema);
      return runnerProblem(user.id, id, input);
    }
    default:
      throw new ApiError(404, "not_found", "Unknown action.");
  }
});
