import { z } from "zod";
import { apiRunner } from "@/lib/auth/session";
import { ApiError, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { departOrder, deliverOrder, pickupOrder, unclaimOrder } from "@/lib/services/orders";
import { deliverSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id, action } = await params;
  const user = await apiRunner();
  switch (action) {
    case "unclaim":
      return unclaimOrder(user.id, id);
    case "pickup": {
      const { photoId } = await parseJson(req, z.object({ photoId: z.string().uuid("Take a photo of the bag first.") }));
      await pickupOrder(user.id, id, photoId);
      return { ok: true };
    }
    case "depart":
      await departOrder(user.id, id);
      return { ok: true };
    case "deliver": {
      await limit(`pin:${user.id}:${id}`, 10, 600, "PIN attempts");
      const proof = await parseJson(req, deliverSchema);
      const res = await deliverOrder(user.id, id, proof);
      if ("wrongPin" in res && res.wrongPin) {
        const left = res.attemptsLeft ?? 0;
        throw new ApiError(
          400,
          "wrong_pin",
          left > 0
            ? `That's not the PIN. ${left} ${left === 1 ? "try" : "tries"} left, then you'll need a door photo.`
            : "Too many wrong PINs. Leave it at the door and upload a photo instead.",
          { pin: "Wrong PIN" },
        );
      }
      return res;
    }
    default:
      throw new ApiError(404, "not_found", "Unknown action.");
  }
});
