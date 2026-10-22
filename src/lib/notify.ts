import "server-only";
import webpush from "web-push";
import { q, q1 } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail, templates, type Email } from "@/lib/email";

export type Category = "order_updates" | "new_jobs" | "disputes" | "account";

type Prefs = {
  push_order_updates: boolean;
  push_new_jobs: boolean;
  push_disputes: boolean;
  push_account: boolean;
  email_order_updates: boolean;
  email_disputes: boolean;
  email_account: boolean;
};

let vapidReady = false;
function pushEnabled() {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    vapidReady = true;
  }
  return true;
}

export async function sendPush(userId: string, payload: { title: string; body: string; url?: string | null; tag?: string }) {
  if (!pushEnabled()) return;
  const subs = await q<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    "select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1",
    [userId],
  );
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 600 },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await q("delete from public.push_subscriptions where id = $1", [s.id]);
        else console.warn("[push] failed", code);
      }
    }),
  );
}

/**
 * In-app notification (always), plus push and email according to the user's
 * preferences. `email` overrides the default email body for that category.
 */
export async function notify(
  userId: string,
  n: { category: Category; title: string; body: string; url?: string | null; email?: Omit<Email, "to"> | null },
) {
  await q("insert into public.notifications (user_id, category, title, body, url) values ($1, $2, $3, $4, $5)", [
    userId,
    n.category,
    n.title,
    n.body,
    n.url ?? null,
  ]);
  const prefs = await q1<Prefs & { email: string | null; status: string }>(
    `select np.*, p.email, p.status from public.profiles p
     left join public.notification_preferences np on np.user_id = p.id where p.id = $1`,
    [userId],
  );
  if (!prefs || prefs.status === "deleted") return;
  const pushKey = `push_${n.category}` as keyof Prefs;
  const emailKey = (n.category === "new_jobs" ? null : `email_${n.category}`) as keyof Prefs | null;
  const tasks: Promise<unknown>[] = [];
  if (prefs[pushKey] ?? true) tasks.push(sendPush(userId, { title: n.title, body: n.body, url: n.url, tag: n.category }));
  if (emailKey && prefs[emailKey] && prefs.email) {
    const mail = n.email ?? templates.notification(n.title, n.body, n.url ?? null);
    tasks.push(sendEmail({ to: prefs.email, ...mail }));
  }
  await Promise.allSettled(tasks);
}

/** Ping every approved, on-shift runner (except `exceptId`). */
export async function notifyOnShiftRunners(n: { title: string; body: string; url?: string }, exceptId?: string) {
  const runners = await q<{ id: string }>(
    "select id from public.profiles where runner_status = 'approved' and on_shift and status = 'active' and id <> coalesce($1::uuid, '00000000-0000-0000-0000-000000000000')",
    [exceptId ?? null],
  );
  await Promise.allSettled(runners.map((r) => notify(r.id, { category: "new_jobs", ...n })));
}

export async function notifyAdmins(n: { title: string; body: string; url?: string }) {
  const admins = await q<{ id: string }>("select id from public.profiles where is_admin and status = 'active'");
  await Promise.allSettled(admins.map((a) => notify(a.id, { category: "account", ...n })));
}
