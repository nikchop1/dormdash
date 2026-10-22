import { z } from "zod";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { issueCameraToken } from "@/lib/services/photos";

// Issued when the in-app camera opens. Evidence uploads without one are rejected.
export const POST = route(async (req) => {
  const user = await apiUser();
  await limit(`camera:${user.id}`, 60, 3600, "camera opens");
  const { kind } = await parseJson(req, z.object({ kind: z.enum(["pickup", "door", "problem", "case"]) }));
  return issueCameraToken(user.id, kind);
});
