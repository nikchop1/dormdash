import { asUser } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { notificationPrefsSchema } from "@/lib/validation";

// Runs as the user: RLS + column grants only allow changing your own preference flags.
export const PATCH = route(async (req) => {
  const user = await apiUser({ verified: false });
  const p = await parseJson(req, notificationPrefsSchema);
  await asUser(user.id, (t) =>
    t.query(
      `update public.notification_preferences set push_order_updates = $2, push_new_jobs = $3, push_disputes = $4, push_account = $5,
         email_order_updates = $6, email_disputes = $7, email_account = $8 where user_id = $1`,
      [user.id, p.push_order_updates, p.push_new_jobs, p.push_disputes, p.push_account, p.email_order_updates, p.email_disputes, p.email_account],
    ),
  );
  return { ok: true };
});
