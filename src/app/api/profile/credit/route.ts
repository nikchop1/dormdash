import { z } from "zod";
import { asUser } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";

// Opt in/out of applying Dormdash credit automatically at checkout.
export const PATCH = route(async (req) => {
  const user = await apiUser();
  const { useCredit } = await parseJson(req, z.object({ useCredit: z.boolean() }));
  await asUser(user.id, (t) => t.query("update public.profiles set use_credit = $2 where id = $1", [user.id, useCredit]));
  return { ok: true };
});
