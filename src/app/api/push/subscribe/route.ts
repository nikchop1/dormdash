import { z } from "zod";
import { asUser } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export const POST = route(async (req) => {
  const user = await apiUser({ verified: false });
  const sub = await parseJson(req, schema);
  await asUser(user.id, async (t) => {
    await t.query("delete from public.push_subscriptions where endpoint = $1", [sub.endpoint]);
    await t.query(
      "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)",
      [user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, (req.headers.get("user-agent") ?? "").slice(0, 200)],
    );
  });
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const user = await apiUser({ verified: false });
  const { endpoint } = await parseJson(req, z.object({ endpoint: z.string().max(1000) }));
  await asUser(user.id, (t) => t.query("delete from public.push_subscriptions where endpoint = $1", [endpoint]));
  return { ok: true };
});
