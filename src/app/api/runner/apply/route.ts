import { z } from "zod";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { applyToRun } from "@/lib/services/runners";
import { runnerApplicationSchema } from "@/lib/validation";

const schema = runnerApplicationSchema.extend({ idPhotoId: z.string().uuid("Upload a photo of your NYU ID.") });

export const POST = route(async (req) => {
  const user = await apiUser(); // must be email-verified
  await limit(`apply:${user.id}`, 5, 24 * 3600, "applications");
  const input = await parseJson(req, schema);
  await applyToRun(user.id, input);
  return { ok: true };
});
